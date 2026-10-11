import { Router } from 'express';
import { db, logAudit, getUnifiedColor, getRecordTimestamp } from '../db';
import { authenticateToken, authorize, isAdmin } from '../middleware';

const router = Router();

// Get shipping / dispatch log
router.get('/shipping', authenticateToken, (req, res) => {
  const records = db.prepare(`
    SELECT sh.*, p.style_num, p.color, p.size
    FROM shipment_records sh
    JOIN po_products p ON sh.product_id = p.id
    ORDER BY sh.created_at DESC
  `).all();
  res.json(records);
});

// Bulk shipping validation & execution
router.post('/shipping/bulk', authenticateToken, authorize(['operator', 'supervisor'], ['Shipping']), (req: any, res) => {
  const { items, import_from_old_stock, dry_run } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items must be a non-empty array' });
  }

  try {
    // 1. Group items by Style, Color, Size to check shortfall
    const shortfalls: any[] = [];
    const groupedRequests: Record<string, {
      style_num: string;
      color: string;
      size: string;
      quantity: number;
      items: any[];
    }> = {};

    for (const item of items) {
      const style = String(item.style_num || '').toUpperCase().trim();
      const color = String(item.color || '').toUpperCase().trim();
      const size = String(item.size || '').toUpperCase().trim();
      const key = `${style}|${color}|${size}`;

      if (!groupedRequests[key]) {
        groupedRequests[key] = {
          style_num: item.style_num || '',
          color: item.color || '',
          size: item.size || '',
          quantity: 0,
          items: []
        };
      }
      groupedRequests[key].quantity += parseInt(String(item.quantity)) || 0;
      groupedRequests[key].items.push(item);
    }

    // Check shortfall for each group
    for (const key of Object.keys(groupedRequests)) {
      const group = groupedRequests[key];
      const { style_num, color, size, quantity } = group;

      const packedResult: any = db.prepare(`
        SELECT COALESCE(SUM(r.quantity), 0) as total 
        FROM pack_records r
        JOIN po_products p ON r.product_id = p.id
        WHERE UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
          AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
          AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
          AND r.status = 'accepted'
          AND r.store_status = 'accepted'
          AND r.packing_type = 'carton'
      `).get(style_num, color, size);

      const shippedResult: any = db.prepare(`
        SELECT COALESCE(SUM(sh.quantity), 0) as total 
        FROM shipment_records sh
        JOIN po_products p ON sh.product_id = p.id
        WHERE UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
          AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
          AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
      `).get(style_num, color, size);

      const discardedResult: any = db.prepare(`
        SELECT COALESCE(SUM(d.quantity), 0) as total
        FROM discard_records d
        JOIN po_products p ON d.product_id = p.id
        WHERE UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
          AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
          AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
          AND d.department = 'Carton Store'
      `).get(style_num, color, size);

      const availableInStockStore = (packedResult?.total || 0) - (shippedResult?.total || 0) - (discardedResult?.total || 0);

      if (quantity > availableInStockStore) {
        const shortfall_qty = quantity - availableInStockStore;

        // Query Old Stock across the other 4 departments (excluding carton store since its old stock is already counted in availableInStockStore)
        let old_stock_qty = 0;
        const depts = [
          { name: 'packing', table: 'finish_records' },
          { name: 'finishing', table: 'stitch_records' },
          { name: 'stitching', table: 'send_records' },
          { name: 'feeding', table: 'cut_records' }
        ];

        for (const d of depts) {
          const resVal: any = db.prepare(`
            SELECT COALESCE(SUM(r.quantity), 0) as total
            FROM ${d.table} r
            JOIN po_products p ON r.product_id = p.id
            WHERE r.is_old_stock = 1
              AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
              AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
              AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
          `).get(style_num, color, size);
          old_stock_qty += resVal?.total || 0;
        }

        if (shortfall_qty > 0) {
          let po_number = group.items[0]?.po_number || '';
          if (!po_number && group.items[0]?.product_id) {
            const prod = db.prepare("SELECT po_number FROM po_products WHERE id = ?").get(group.items[0].product_id) as any;
            if (prod) po_number = prod.po_number;
          }
          shortfalls.push({
            po_number,
            style_num,
            color,
            size,
            shortfall_qty,
            old_stock_qty
          });
        }
      }
    }

    if (dry_run) {
      return res.json({
        success: true,
        has_shortfall: shortfalls.length > 0,
        shortfalls
      });
    }

    // Execute bulk transaction
    const nowTimestamp = getRecordTimestamp(req);

    const runBulkTransaction = db.transaction(() => {
      // 1. Resolve and create targets, and import old stock if requested
      const resolvedItems = items.map((item: any) => {
        let targetProductId = parseInt(String(item.product_id || 0));
        let targetProduct: any = targetProductId > 0 ? db.prepare("SELECT * FROM po_products WHERE id = ?").get(targetProductId) : null;

        if (!targetProduct) {
          const st = item.style_num || item.item_num || '';
          const sz = item.size || '';
          const cl = item.color || '';

          if (item.po_number && st) {
            const existingCand = db.prepare(`
              SELECT * FROM po_products 
              WHERE po_number = ? 
                AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
                AND UPPER(TRIM(size)) = UPPER(TRIM(?))
            `).all(item.po_number, st, sz) as any[];

            if (existingCand.length > 0) {
              const unifiedCl = getUnifiedColor(cl, []);
              const match = existingCand.find((c: any) => getUnifiedColor(c.color || '', []) === unifiedCl || (c.color || '').toUpperCase().trim() === cl.toUpperCase().trim());
              if (match) {
                targetProduct = match;
                targetProductId = match.id;
              } else {
                targetProduct = existingCand[0];
                targetProductId = existingCand[0].id;
              }
            }
          }

          if (!targetProduct) {
            const poExists = db.prepare("SELECT po_number FROM production_orders WHERE po_number = ?").get(item.po_number);
            if (!poExists) {
              db.prepare("INSERT OR IGNORE INTO production_orders (po_number, total_qty, status) VALUES (?, ?, 'Active')").run(item.po_number, item.quantity || 0);
            }

            const tmpl = (item.style_num || item.item_num) ? db.prepare("SELECT * FROM po_products WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?)) LIMIT 1").get(item.style_num || item.item_num) as any : null;

            const ins = db.prepare(`
              INSERT INTO po_products (po_number, style_num, item_num, description, color, size, qty, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              item.po_number,
              item.style_num || item.item_num || 'UNSPECIFIED',
              item.item_num || tmpl?.item_num || item.style_num || '',
              tmpl?.description || 'Shipment Upload Auto-Created',
              item.color || tmpl?.color || 'UNSPECIFIED',
              item.size || 'UNSPECIFIED',
              item.quantity || 0,
              req.user?.id || 1
            );
            targetProductId = Number(ins.lastInsertRowid);
            targetProduct = db.prepare("SELECT * FROM po_products WHERE id = ?").get(targetProductId);
          }
        }
        return {
          ...item,
          targetProduct,
          targetProductId
        };
      });

      // 2. Perform Old Stock Imports if user confirmed Yes
      if (import_from_old_stock && shortfalls.length > 0) {
        for (const sf of shortfalls) {
          let remainingToImport = sf.shortfall_qty;
          const depts = [
            { name: 'carton', table: 'pack_records' },
            { name: 'packing', table: 'finish_records' },
            { name: 'finishing', table: 'stitch_records' },
            { name: 'stitching', table: 'send_records' },
            { name: 'feeding', table: 'cut_records' }
          ];

          // Fetch all matching old stock records
          const oldStockRecords: any[] = [];
          for (const d of depts) {
            const hasPcsPerCarton = d.table === 'pack_records';
            const rows = db.prepare(`
              SELECT 
                '${d.name}' as dept, r.id, r.quantity, r.po_number, r.product_id,
                ${hasPcsPerCarton ? 'r.pcs_per_carton' : 'NULL as pcs_per_carton'}
              FROM ${d.table} r
              JOIN po_products p ON r.product_id = p.id
              WHERE r.is_old_stock = 1
                AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
                AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
                AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
              ORDER BY r.created_at ASC
            `).all(sf.style_num, sf.color, sf.size) as any[];
            oldStockRecords.push(...rows);
          }

          // Consume from old stock and inject to carton
          for (const rec of oldStockRecords) {
            if (remainingToImport <= 0) break;
            const takeQty = Math.min(remainingToImport, rec.quantity);

            // Deduct/Delete from department
            let tableName = '';
            if (rec.dept === 'carton') tableName = 'pack_records';
            else if (rec.dept === 'packing') tableName = 'finish_records';
            else if (rec.dept === 'finishing') tableName = 'stitch_records';
            else if (rec.dept === 'stitching') tableName = 'send_records';
            else if (rec.dept === 'feeding') tableName = 'cut_records';

            if (takeQty === rec.quantity) {
              db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(rec.id);
            } else {
              db.prepare(`UPDATE ${tableName} SET quantity = quantity - ? WHERE id = ?`).run(takeQty, rec.id);
            }

            // Find matching resolved item to get target PO and product details
            const matchedRi = resolvedItems.find((ri: any) => 
              String(ri.style_num || '').toUpperCase().trim() === sf.style_num &&
              String(ri.color || '').toUpperCase().trim() === sf.color &&
              String(ri.size || '').toUpperCase().trim() === sf.size
            );

            const targetPo = matchedRi ? matchedRi.po_number : sf.style_num;
            const targetProdId = matchedRi ? matchedRi.targetProductId : rec.product_id;
            const ppc = matchedRi?.pieces_per_carton || rec.pcs_per_carton || 1;
            const targetCartons = Math.max(1, Math.ceil(takeQty / (ppc > 0 ? ppc : 1)));

            // Inject to standard carton pack_records as old stock to prevent causing deficits in predecessor departments
            db.prepare(`
              INSERT INTO pack_records (
                po_number, product_id, quantity, cartons, packing_type, pcs_per_carton,
                status, store_status, created_by, created_at, is_old_stock
              )
              VALUES (?, ?, ?, ?, 'carton', ?, 'accepted', 'accepted', ?, ?, 1)
            `).run(targetPo, targetProdId, takeQty, targetCartons, ppc, req.user?.id || 1, nowTimestamp);

            remainingToImport -= takeQty;
          }
        }
      }

      // 3. Complete shipping logic for all items (just like single item /shipping route)
      for (const ri of resolvedItems) {
        const qty = parseInt(String(ri.quantity));
        const ctn = parseInt(String(ri.cartons || 0));
        const { po_number, targetProductId, targetProduct, sscc, item_num, line_num, color, size, pieces_per_carton, cartons } = ri;

        // Re-calculate available stock on target product
        let packedTotal = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'").get(targetProductId) as any;
        let shippedTotal = db.prepare('SELECT SUM(quantity) as total FROM shipment_records WHERE product_id = ?').get(targetProductId) as any;
        let discardedTotal = db.prepare("SELECT SUM(quantity) as total FROM discard_records WHERE product_id = ? AND department = 'Carton Store'").get(targetProductId) as any;
        let available = (packedTotal?.total || 0) - (shippedTotal?.total || 0) - (discardedTotal?.total || 0);

        if (qty > available && targetProduct) {
          let needed = qty - available;

          // Fetch candidates from other products/POs matching style & size
          const candidates = db.prepare(`
            SELECT p.id, p.color, p.po_number, po.priority, po.created_at, po.delivery_date
            FROM po_products p
            LEFT JOIN production_orders po ON p.po_number = po.po_number
            WHERE p.id != ?
              AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
              AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
          `).all(targetProductId, targetProduct.style_num || '', targetProduct.size || '') as any[];

          // Filter candidates where color matches standard unified form
          const unifiedTargetColor = getUnifiedColor(targetProduct.color || '', []);
          const filteredCandidates = candidates.filter((c: any) => {
            const unifiedCandColor = getUnifiedColor(c.color || '', []);
            return unifiedCandColor === unifiedTargetColor || (c.color || '').toUpperCase().trim() === (targetProduct.color || '').toUpperCase().trim();
          });

          // Sort candidates: Virtual/Holding POs first, then Active POs by delivery/creation date (FIFO)
          filteredCandidates.sort((a: any, b: any) => {
            const aIsUnallocated = (a.po_number || '').toUpperCase().includes('UNALLOCATED') || (a.po_number || '').toUpperCase() === 'UNIVERSAL';
            const bIsUnallocated = (b.po_number || '').toUpperCase().includes('UNALLOCATED') || (b.po_number || '').toUpperCase() === 'UNIVERSAL';
            
            if (aIsUnallocated && !bIsUnallocated) return -1;
            if (!aIsUnallocated && bIsUnallocated) return 1;

            if (a.delivery_date && b.delivery_date) {
              const dA = new Date(a.delivery_date).getTime();
              const dB = new Date(b.delivery_date).getTime();
              if (dA !== dB) return dA - dB;
            }

            return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
          });

          // Reallocate stock from candidate POs to our target PO
          for (const cand of filteredCandidates) {
            if (needed <= 0) break;

            const candPacked: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'").get(cand.id);
            const candShipped: any = db.prepare('SELECT SUM(quantity) as total FROM shipment_records WHERE product_id = ?').get(cand.id);
            const candDiscarded: any = db.prepare("SELECT SUM(quantity) as total FROM discard_records WHERE product_id = ? AND department = 'Carton Store'").get(cand.id);
            const candAvailable = (candPacked?.total || 0) - (candShipped?.total || 0) - (candDiscarded?.total || 0);

            if (candAvailable > 0) {
              const takeQty = Math.min(needed, candAvailable);
              let remainingToTake = takeQty;

              const candRecords = db.prepare(`
                SELECT * FROM pack_records 
                WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'
                ORDER BY created_at ASC
              `).all(cand.id) as any[];

              for (const record of candRecords) {
                if (remainingToTake <= 0) break;

                const recordQty = record.quantity;
                if (recordQty <= remainingToTake) {
                  db.prepare(`UPDATE pack_records SET po_number = ?, product_id = ? WHERE id = ?`)
                    .run(po_number, targetProductId, record.id);
                  remainingToTake -= recordQty;
                } else {
                  const fraction = remainingToTake / recordQty;
                  const originalCartons = record.cartons || 1;
                  const targetCartons = Math.max(1, Math.round(originalCartons * fraction));

                  db.prepare(`UPDATE pack_records SET quantity = quantity - ?, cartons = MAX(0, cartons - ?) WHERE id = ?`)
                    .run(remainingToTake, targetCartons, record.id);

                  db.prepare(`
                    INSERT INTO pack_records (
                      po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, 
                      status, store_status, received_by, received_at, created_by, created_at, is_old_stock
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `).run(
                    po_number, 
                    targetProductId, 
                    remainingToTake, 
                    targetCartons, 
                    record.packing_type, 
                    record.pcs_per_carton, 
                    record.status, 
                    record.store_status, 
                    record.received_by, 
                    record.received_at, 
                    record.created_by, 
                    record.created_at,
                    record.is_old_stock || 0
                  );

                  remainingToTake = 0;
                }
              }

              needed -= takeQty;
            }
          }

          // Recalculate available stock on target product
          packedTotal = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'").get(targetProductId) as any;
          shippedTotal = db.prepare('SELECT SUM(quantity) as total FROM shipment_records WHERE product_id = ?').get(targetProductId) as any;
          discardedTotal = db.prepare("SELECT SUM(quantity) as total FROM discard_records WHERE product_id = ? AND department = 'Carton Store'").get(targetProductId) as any;
          available = (packedTotal?.total || 0) - (shippedTotal?.total || 0) - (discardedTotal?.total || 0);

          if (qty > available) {
            const missingQty = qty - available;
            const ppc = pieces_per_carton || targetProduct.pcs_per_carton || 1;
            const missingCtns = Math.max(1, Math.ceil(missingQty / (ppc > 0 ? ppc : 1)));

            db.prepare(`
              INSERT INTO pack_records (
                po_number, product_id, quantity, cartons, packing_type, pcs_per_carton,
                status, store_status, created_by, created_at
              )
              VALUES (?, ?, ?, ?, 'carton', ?, 'accepted', 'accepted', ?, ?)
            `).run(po_number, targetProductId, missingQty, missingCtns, ppc > 0 ? ppc : 1, req.user?.id || 1, nowTimestamp);
          }
        }

        db.prepare(`
          INSERT INTO shipment_records (po_number, product_id, quantity, sscc, item_num, line_num, color, size, pieces_per_carton, cartons, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(po_number, targetProductId, qty, sscc, item_num, line_num, color || targetProduct?.color, size || targetProduct?.size, pieces_per_carton, cartons, req.user.id, nowTimestamp);

        logAudit(req.user.id, 'CREATE', 'shipment_records', targetProductId, null, { po_number, quantity: qty, sscc });
      }
    });

    runBulkTransaction();
    res.json({ success: true, imported_shortfalls: import_from_old_stock ? shortfalls.length : 0 });
  } catch (err: any) {
    console.error('Bulk shipping failed:', err);
    res.status(500).json({ error: 'Bulk shipping operation failed', message: err.message });
  }
});

// Create shipping / dispatch record with SSCC and carton distribution details
router.post('/shipping', authenticateToken, authorize(['operator', 'supervisor'], ['Shipping']), (req: any, res) => {
  const { po_number, product_id, quantity, sscc, item_num, line_num, color, size, pieces_per_carton, cartons, style_num } = req.body;
  const qty = parseInt(String(quantity));
  const ctn = parseInt(String(cartons || 0));

  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (isNaN(ctn) || ctn <= 0) return res.status(400).json({ error: 'Carton count must be positive' });

  const recordTimestamp = getRecordTimestamp(req);
  let targetProductId = parseInt(String(product_id || 0));

  const transaction = db.transaction(() => {
    // 1. Resolve target product object
    let targetProduct: any = targetProductId > 0 ? db.prepare("SELECT * FROM po_products WHERE id = ?").get(targetProductId) : null;

    if (!targetProduct) {
      const st = style_num || item_num || '';
      const sz = size || '';
      const cl = color || '';

      if (po_number && st) {
        const existingCand = db.prepare(`
          SELECT * FROM po_products 
          WHERE po_number = ? 
            AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(size)) = UPPER(TRIM(?))
        `).all(po_number, st, sz) as any[];

        if (existingCand.length > 0) {
          const unifiedCl = getUnifiedColor(cl, []);
          const match = existingCand.find((c: any) => getUnifiedColor(c.color || '', []) === unifiedCl || (c.color || '').toUpperCase().trim() === cl.toUpperCase().trim());
          if (match) {
            targetProduct = match;
            targetProductId = match.id;
          } else {
            targetProduct = existingCand[0];
            targetProductId = existingCand[0].id;
          }
        }
      }

      if (!targetProduct) {
        const poExists = db.prepare("SELECT po_number FROM production_orders WHERE po_number = ?").get(po_number);
        if (!poExists) {
          db.prepare("INSERT OR IGNORE INTO production_orders (po_number, total_qty, status) VALUES (?, ?, 'Active')").run(po_number, qty);
        }

        const tmpl = (style_num || item_num) ? db.prepare("SELECT * FROM po_products WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?)) LIMIT 1").get(style_num || item_num) as any : null;

        const ins = db.prepare(`
          INSERT INTO po_products (po_number, style_num, item_num, description, color, size, qty, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          po_number,
          style_num || item_num || 'UNSPECIFIED',
          item_num || tmpl?.item_num || style_num || '',
          tmpl?.description || 'Shipment Upload Auto-Created',
          color || tmpl?.color || 'UNSPECIFIED',
          size || 'UNSPECIFIED',
          qty,
          req.user?.id || 1
        );
        targetProductId = Number(ins.lastInsertRowid);
        targetProduct = db.prepare("SELECT * FROM po_products WHERE id = ?").get(targetProductId);
      }
    }

    // Validate vs ACCEPTED packed (CARTONS ONLY)
    let packedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'").get(targetProductId);
    let shippedTotal: any = db.prepare('SELECT SUM(quantity) as total FROM shipment_records WHERE product_id = ?').get(targetProductId);
    let discardedTotal = db.prepare("SELECT SUM(quantity) as total FROM discard_records WHERE product_id = ? AND department = 'Carton Store'").get(targetProductId) as any;
    let available = (packedTotal?.total || 0) - (shippedTotal?.total || 0) - (discardedTotal?.total || 0);

    if (qty > available && targetProduct) {
      let needed = qty - available;

      // Fetch candidates from other products/POs matching style & size
      const candidates = db.prepare(`
        SELECT p.id, p.color, p.po_number, po.priority, po.created_at, po.delivery_date
        FROM po_products p
        LEFT JOIN production_orders po ON p.po_number = po.po_number
        WHERE p.id != ?
          AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
          AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
      `).all(targetProductId, targetProduct.style_num || '', targetProduct.size || '') as any[];

      // Filter candidates where color matches standard unified form
      const unifiedTargetColor = getUnifiedColor(targetProduct.color || '', []);
      const filteredCandidates = candidates.filter((c: any) => {
        const unifiedCandColor = getUnifiedColor(c.color || '', []);
        return unifiedCandColor === unifiedTargetColor || (c.color || '').toUpperCase().trim() === (targetProduct.color || '').toUpperCase().trim();
      });

      // Sort candidates: Virtual/Holding POs first, then Active POs by delivery/creation date (FIFO)
      filteredCandidates.sort((a: any, b: any) => {
        const aIsUnallocated = (a.po_number || '').toUpperCase().includes('UNALLOCATED') || (a.po_number || '').toUpperCase() === 'UNIVERSAL';
        const bIsUnallocated = (b.po_number || '').toUpperCase().includes('UNALLOCATED') || (b.po_number || '').toUpperCase() === 'UNIVERSAL';
        
        if (aIsUnallocated && !bIsUnallocated) return -1;
        if (!aIsUnallocated && bIsUnallocated) return 1;

        if (a.delivery_date && b.delivery_date) {
          const dA = new Date(a.delivery_date).getTime();
          const dB = new Date(b.delivery_date).getTime();
          if (dA !== dB) return dA - dB;
        }

        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });

      // Reallocate stock from candidate POs to our target PO
      for (const cand of filteredCandidates) {
        if (needed <= 0) break;

        const candPacked: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'").get(cand.id);
        const candShipped: any = db.prepare('SELECT SUM(quantity) as total FROM shipment_records WHERE product_id = ?').get(cand.id);
        const candDiscarded: any = db.prepare("SELECT SUM(quantity) as total FROM discard_records WHERE product_id = ? AND department = 'Carton Store'").get(cand.id);
        const candAvailable = (candPacked?.total || 0) - (candShipped?.total || 0) - (candDiscarded?.total || 0);

        if (candAvailable > 0) {
          const takeQty = Math.min(needed, candAvailable);
          let remainingToTake = takeQty;

          // Match packed cartons in stock store regardless of store intake status
          const candRecords = db.prepare(`
            SELECT * FROM pack_records 
            WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'
            ORDER BY created_at ASC
          `).all(cand.id) as any[];

          for (const record of candRecords) {
            if (remainingToTake <= 0) break;

            const recordQty = record.quantity;
            if (recordQty <= remainingToTake) {
              db.prepare(`UPDATE pack_records SET po_number = ?, product_id = ? WHERE id = ?`)
                .run(po_number, targetProductId, record.id);
              remainingToTake -= recordQty;
            } else {
              const fraction = remainingToTake / recordQty;
              const originalCartons = record.cartons || 1;
              const targetCartons = Math.max(1, Math.round(originalCartons * fraction));

              db.prepare(`UPDATE pack_records SET quantity = quantity - ?, cartons = MAX(0, cartons - ?) WHERE id = ?`)
                .run(remainingToTake, targetCartons, record.id);

              db.prepare(`
                INSERT INTO pack_records (
                  po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, 
                  status, store_status, received_by, received_at, created_by, created_at, is_old_stock
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                po_number, 
                targetProductId, 
                remainingToTake, 
                targetCartons, 
                record.packing_type, 
                record.pcs_per_carton, 
                record.status, 
                record.store_status, 
                record.received_by, 
                record.received_at, 
                record.created_by, 
                record.created_at,
                record.is_old_stock || 0
              );

              remainingToTake = 0;
            }
          }

          needed -= takeQty;
        }
      }

      // Recalculate available stock on target product
      packedTotal = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'").get(targetProductId);
      shippedTotal = db.prepare('SELECT SUM(quantity) as total FROM shipment_records WHERE product_id = ?').get(targetProductId);
      discardedTotal = db.prepare("SELECT SUM(quantity) as total FROM discard_records WHERE product_id = ? AND department = 'Carton Store'").get(targetProductId) as any;
      available = (packedTotal?.total || 0) - (shippedTotal?.total || 0) - (discardedTotal?.total || 0);

      // Authoritative physical shipment upload reconciliation:
      // If physical shipment file upload exceeds software stock even after cross-PO reallocation,
      // auto-reconcile the physical vs software stock mismatch by recording the physical stock.
      if (qty > available) {
        const missingQty = qty - available;
        const ppc = pieces_per_carton || targetProduct.pcs_per_carton || 1;
        const missingCtns = Math.max(1, Math.ceil(missingQty / (ppc > 0 ? ppc : 1)));

        db.prepare(`
          INSERT INTO pack_records (
            po_number, product_id, quantity, cartons, packing_type, pcs_per_carton,
            status, store_status, created_by, created_at
          )
          VALUES (?, ?, ?, ?, 'carton', ?, 'accepted', 'accepted', ?, COALESCE(?, CURRENT_TIMESTAMP))
        `).run(po_number, targetProductId, missingQty, missingCtns, ppc > 0 ? ppc : 1, req.user?.id || 1, recordTimestamp);
      }
    }

    db.prepare(`
      INSERT INTO shipment_records (po_number, product_id, quantity, sscc, item_num, line_num, color, size, pieces_per_carton, cartons, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(po_number, targetProductId, qty, sscc, item_num, line_num, color || targetProduct?.color, size || targetProduct?.size, pieces_per_carton, cartons, req.user.id, recordTimestamp);
  });

  try {
    transaction();
    logAudit(req.user.id, 'CREATE', 'shipment_records', targetProductId, null, { po_number, quantity: qty, sscc });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete shipping record (Admin only)
router.delete('/shipping/:id', authenticateToken, isAdmin, (req, res) => {
  db.prepare('DELETE FROM shipment_records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
