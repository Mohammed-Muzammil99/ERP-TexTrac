import { Router } from 'express';
import { body } from 'express-validator';
import { 
  db, 
  determineBuyerFromStyle, 
  determineBuyersFromProducts, 
  findPO, 
  logAudit,
  normalizeToFullForm,
  getUnifiedColor
} from '../db';
import { authenticateToken, authorize, validate, isAdmin } from '../middleware';

const router = Router();

// --- Colors ---
router.get('/colors', authenticateToken, (req, res) => {
  const colors = db.prepare('SELECT * FROM colors ORDER BY name ASC').all();
  res.json(colors);
});

router.post('/colors', authenticateToken, isAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Color name required' });
  try {
    db.prepare('INSERT INTO colors (name) VALUES (?)').run(name.trim());
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Color already exists' });
  }
});

router.delete('/colors/:id', authenticateToken, isAdmin, (req, res) => {
  db.prepare('DELETE FROM colors WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Custom Columns ---
router.get('/po/custom-columns', authenticateToken, (req, res) => {
  const cols = db.prepare('SELECT * FROM custom_columns ORDER BY sort_order').all();
  res.json(cols);
});

router.post('/po/custom-columns', authenticateToken, authorize(['supervisor'], ['Admin']), (req, res) => {
  const { key, label, col_type } = req.body;
  try {
    db.prepare('INSERT INTO custom_columns (key, label, col_type) VALUES (?, ?, ?)').run(key, label, col_type);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Column key already exists' });
  }
});

router.delete('/po/custom-columns/:key', authenticateToken, authorize(['supervisor'], ['Admin']), (req, res) => {
  db.prepare('DELETE FROM custom_columns WHERE key = ?').run(req.params.key);
  res.json({ success: true });
});

// --- Priorities and Status Patches ---
router.patch('/po/products/:id/priority', authenticateToken, authorize(['supervisor'], ['Admin']), (req, res) => {
  const { priority } = req.body;
  if (!['Normal', 'Urgent', 'Low'].includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }
  db.prepare('UPDATE po_products SET priority = ? WHERE id = ?').run(priority, req.params.id);
  res.json({ success: true });
});

router.patch('/po/:po_number/priority', authenticateToken, authorize(['supervisor'], ['Admin']), (req, res) => {
  const { priority } = req.body;
  if (!['Normal', 'Urgent', 'Low'].includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }
  db.prepare('UPDATE production_orders SET priority = ? WHERE po_number = ?').run(priority, req.params.po_number);
  res.json({ success: true });
});

// Admin Correction for Style-Buyer Mapping
router.patch('/po/update-style-buyer', authenticateToken, authorize(['supervisor'], ['Admin']), (req: any, res) => {
  const { styleNum, buyer, poNumbers } = req.body;
  if (!buyer || !buyer.trim()) {
    return res.status(400).json({ error: 'Buyer name is required' });
  }
  const cleanBuyer = buyer.trim();
  const cleanStyle = styleNum ? styleNum.trim() : null;

  try {
    let updatedCount = 0;
    const transaction = db.transaction(() => {
      if (Array.isArray(poNumbers) && poNumbers.length > 0) {
        for (const poNum of poNumbers) {
          db.prepare('UPDATE production_orders SET buyer = ?, updated_at = CURRENT_TIMESTAMP WHERE po_number = ?').run(cleanBuyer, poNum);
          if (cleanStyle) {
            db.prepare('UPDATE po_products SET buyer = ? WHERE po_number = ? AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))').run(cleanBuyer, poNum, cleanStyle);
          } else {
            db.prepare('UPDATE po_products SET buyer = ? WHERE po_number = ?').run(cleanBuyer, poNum);
          }
          updatedCount++;
        }
      } else if (cleanStyle) {
        const matchingPOs = db.prepare('SELECT DISTINCT po_number FROM po_products WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))').all(cleanStyle) as any[];
        for (const poRow of matchingPOs) {
          db.prepare('UPDATE production_orders SET buyer = ?, updated_at = CURRENT_TIMESTAMP WHERE po_number = ?').run(cleanBuyer, poRow.po_number);
          db.prepare('UPDATE po_products SET buyer = ? WHERE po_number = ? AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))').run(cleanBuyer, poRow.po_number, cleanStyle);
          updatedCount++;
        }
      }
    });
    transaction();

    logAudit(req.user.id, 'CORRECT_BUYER_MAPPING', 'production_orders', cleanStyle || (poNumbers ? poNumbers.join(',') : 'ALL'), null, { buyer: cleanBuyer });

    res.json({ success: true, updatedCount });
  } catch (e: any) {
    console.error('Update style buyer error:', e);
    res.status(500).json({ error: 'Failed to update buyer: ' + e.message });
  }
});

router.patch('/po/:po_number/status', authenticateToken, authorize(['supervisor'], ['Admin']), (req: any, res) => {
  const po_number = req.params.po_number.trim();
  const { status } = req.body;
  
  if (!['Active', 'Closed', 'On Review', 'On Hold'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const existingPO: any = db.prepare('SELECT status FROM production_orders WHERE po_number = ?').get(po_number);
  if (!existingPO) {
    return res.status(404).json({ error: 'PO not found' });
  }

  const previousStatus = existingPO.status;

  if (previousStatus !== status) {
    try {
      if (status === 'Closed') {
        const transaction = db.transaction(() => {
          // 1. Calculate and save aggregate stats to archived_po_summaries
          const products = db.prepare('SELECT * FROM po_products WHERE po_number = ?').all(po_number) as any[];
          for (const prod of products) {
            const pid = prod.id;

            const totalCut = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM cut_records WHERE product_id = ? AND status = 'accepted'").get(pid) as any;
            const totalSent = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM send_records WHERE product_id = ? AND status = 'accepted'").get(pid) as any;
            const totalStitched = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM stitch_records WHERE product_id = ? AND status = 'accepted'").get(pid) as any;
            
            const totalPassed = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM finish_records WHERE product_id = ? AND result = 'pass' AND status = 'accepted'").get(pid) as any;
            const totalRejected = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM finish_records WHERE product_id = ? AND result = 'reject' AND status != 'rejected'").get(pid) as any;

            const totalPackedLoose = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM pack_records WHERE product_id = ? AND packing_type = 'loose' AND status = 'accepted'").get(pid) as any;
            const totalPackedBlister = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM pack_records WHERE product_id = ? AND packing_type = 'blister' AND status = 'accepted'").get(pid) as any;
            const totalPackedCarton = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM pack_records WHERE product_id = ? AND packing_type = 'carton' AND status = 'accepted'").get(pid) as any;
            const totalPackedCartonCount = db.prepare("SELECT COALESCE(SUM(cartons), 0) as total FROM pack_records WHERE product_id = ? AND packing_type = 'carton' AND status = 'accepted'").get(pid) as any;

            const totalShipped = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM shipment_records WHERE product_id = ?").get(pid) as any;
            const totalReturns = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM return_records WHERE product_id = ? AND status = 'accepted'").get(pid) as any;

            // Delete existing summary if any
            db.prepare('DELETE FROM archived_po_summaries WHERE product_id = ?').run(pid);

            db.prepare(`
              INSERT INTO archived_po_summaries (
                po_number, product_id, style_num, color, size, order_qty,
                total_cut, total_sent, total_stitched, total_finished_passed, total_finished_rejected,
                total_packed_loose, total_packed_blister, total_packed_carton, total_packed_carton_count, total_shipped, total_returns
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              po_number, pid, prod.style_num, prod.color, prod.size, prod.qty || 0,
              totalCut.total, totalSent.total, totalStitched.total, totalPassed.total, totalRejected.total,
              totalPackedLoose.total, totalPackedBlister.total, totalPackedCarton.total, totalPackedCartonCount.total, totalShipped.total, totalReturns.total
            );
          }

          // 2. Archive logs and delete from active tables
          const tables = [
            { active: 'cut_records', archive: 'archive_cut_records' },
            { active: 'send_records', archive: 'archive_send_records' },
            { active: 'stitch_records', archive: 'archive_stitch_records' },
            { active: 'finish_records', archive: 'archive_finish_records' },
            { active: 'pack_records', archive: 'archive_pack_records' },
            { active: 'return_records', archive: 'archive_return_records' },
            { active: 'fabric_records', archive: 'archive_fabric_records' },
            { active: 'cutting_programs', archive: 'archive_cutting_programs' }
          ];

          for (const item of tables) {
            db.prepare(`INSERT OR REPLACE INTO ${item.archive} SELECT * FROM ${item.active} WHERE po_number = ?`).run(po_number);
            db.prepare(`DELETE FROM ${item.active} WHERE po_number = ?`).run(po_number);
          }

          // 3. Update Status
          db.prepare('UPDATE production_orders SET status = ? WHERE po_number = ?').run(status, po_number);
        });
        transaction();
        logAudit(req.user.id, 'CLOSE_PO_ARCHIVE', 'production_orders', po_number, { status: previousStatus }, { status: 'Closed' });
      } else if (previousStatus === 'Closed') {
        const transaction = db.transaction(() => {
          const tables = [
            { active: 'cut_records', archive: 'archive_cut_records' },
            { active: 'send_records', archive: 'archive_send_records' },
            { active: 'stitch_records', archive: 'archive_stitch_records' },
            { active: 'finish_records', archive: 'archive_finish_records' },
            { active: 'pack_records', archive: 'archive_pack_records' },
            { active: 'return_records', archive: 'archive_return_records' },
            { active: 'fabric_records', archive: 'archive_fabric_records' },
            { active: 'cutting_programs', archive: 'archive_cutting_programs' }
          ];

          for (const item of tables) {
            db.prepare(`INSERT OR REPLACE INTO ${item.active} SELECT * FROM ${item.archive} WHERE po_number = ?`).run(po_number);
            db.prepare(`DELETE FROM ${item.archive} WHERE po_number = ?`).run(po_number);
          }

          db.prepare('DELETE FROM archived_po_summaries WHERE po_number = ?').run(po_number);
          db.prepare('UPDATE production_orders SET status = ? WHERE po_number = ?').run(status, po_number);
        });
        transaction();
        logAudit(req.user.id, 'REOPEN_PO_ACTIVATE', 'production_orders', po_number, { status: 'Closed' }, { status });
      } else {
        db.prepare('UPDATE production_orders SET status = ? WHERE po_number = ?').run(status, po_number);
        logAudit(req.user.id, 'UPDATE_STATUS', 'production_orders', po_number, { status: previousStatus }, { status });
      }
    } catch (e: any) {
      console.error('PO status transition error:', e);
      return res.status(500).json({ error: 'Status update failed: ' + e.message });
    }
  }

  res.json({ success: true });
});

// --- Production Orders ---

// Get all POs with product/buyer details
router.get('/po', authenticateToken, (req, res) => {
  const rawPos = db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC`).all() as any[];
  const allProducts = db.prepare(`SELECT * FROM po_products`).all() as any[];

  const result: any[] = [];

  rawPos.forEach((po) => {
    const poProducts = allProducts.filter(p => p.po_number === po.po_number);
    if (poProducts.length === 0) {
      result.push({
        ...po,
        product_count: 0,
        styles: '',
        colors: '',
        sizes: ''
      });
      return;
    }

    // If PO has explicit buyer in DB, use it directly
    const explicitPOBuyer = po.buyer && po.buyer.trim() && po.buyer.trim().toUpperCase() !== 'UNIVERSAL' && po.buyer.trim().toUpperCase() !== 'GLOBAL' ? po.buyer.trim() : null;

    if (explicitPOBuyer) {
      const uniqueStyles = Array.from(new Set(poProducts.map(p => p.style_num).filter(Boolean))).join(', ');
      const uniqueColors = Array.from(new Set(poProducts.map(p => p.color).filter(Boolean))).join(', ');
      const uniqueSizes = Array.from(new Set(poProducts.map(p => p.size).filter(Boolean))).join(', ');
      const total_qty = poProducts.reduce((sum, p) => sum + (p.qty || 0), 0);
      const total_value = poProducts.reduce((sum, p) => sum + ((p.qty || 0) * (p.unit_price || 0)), 0);

      result.push({
        ...po,
        buyer: explicitPOBuyer,
        total_qty: po.total_qty || total_qty,
        total_value: po.total_value || total_value,
        product_count: poProducts.length,
        styles: uniqueStyles,
        colors: uniqueColors,
        sizes: uniqueSizes
      });
      return;
    }

    // Group products of this PO by determineBuyerFromStyle
    const groups: Record<string, any[]> = {};
    poProducts.forEach(p => {
      const b = p.buyer || determineBuyerFromStyle(p.style_num) || 'badger';
      if (!groups[b]) groups[b] = [];
      groups[b].push(p);
    });

    Object.entries(groups).forEach(([buyer, prods]) => {
      const uniqueStyles = Array.from(new Set(prods.map(p => p.style_num).filter(Boolean))).join(', ');
      const uniqueColors = Array.from(new Set(prods.map(p => p.color).filter(Boolean))).join(', ');
      const uniqueSizes = Array.from(new Set(prods.map(p => p.size).filter(Boolean))).join(', ');
      const total_qty = prods.reduce((sum, p) => sum + (p.qty || 0), 0);
      const total_value = prods.reduce((sum, p) => sum + ((p.qty || 0) * (p.unit_price || 0)), 0);

      result.push({
        ...po,
        buyer, // Split buyer dynamically
        total_qty,
        total_value,
        product_count: prods.length,
        styles: uniqueStyles,
        colors: uniqueColors,
        sizes: uniqueSizes
      });
    });
  });

  res.json(result);
});

// Get a specific PO
router.get('/po/:po_number', authenticateToken, (req, res) => {
  const poNum = req.params.po_number.trim();
  const po = findPO(poNum);
             
  if (!po) return res.status(404).json({ error: `PO not found: "${poNum}"` });
  
  let products = db.prepare('SELECT * FROM po_products WHERE po_number = ? ORDER BY sort_order').all((po as any).po_number) as any[];
  
  const requestBuyer = req.query.buyer as string;
  if (requestBuyer) {
    products = products.filter(p => determineBuyerFromStyle(p.style_num) === requestBuyer);
  }
  
  // Compute total qty and value specifically for filtered products if filtered
  let total_qty = (po as any).total_qty;
  let total_value = (po as any).total_value;
  let buyer = (po as any).buyer;
  if (requestBuyer) {
    total_qty = products.reduce((sum, p) => sum + (p.qty || 0), 0);
    total_value = products.reduce((sum, p) => sum + ((p.qty || 0) * (p.unit_price || 0)), 0);
    buyer = requestBuyer;
  }
  
  res.json({ ...(po as any), buyer, total_qty, total_value, products });
});

// Create/Update generic PO (using post request)
router.post('/po', 
  authenticateToken, 
  authorize(['supervisor'], ['Admin']),
  body('po_number').trim().notEmpty().withMessage('PO Number is required'),
  body('products').isArray({ min: 1 }).withMessage('At least one product is required'),
  validate,
  (req: any, res) => {
    const { po_number, buyer, season, floor, delivery_date, priority, status, remarks, products } = req.body;
    const trimmedPO = po_number.trim();
    const total_qty = products.reduce((sum: number, p: any) => sum + (p.qty || 0), 0);
    const total_value = products.reduce((sum: number, p: any) => sum + ((p.qty || 0) * (p.unit_price || 0)), 0);
    const actualBuyer = determineBuyersFromProducts(products, buyer);

    const existingPO: any = db.prepare('SELECT * FROM production_orders WHERE po_number = ?').get(trimmedPO);

    const transaction = db.transaction(() => {
      if (existingPO) {
        // --- UPDATE / OVERWRITE mode ---
        db.prepare(`
          UPDATE production_orders 
          SET buyer = ?, season = ?, floor = ?, delivery_date = ?, priority = ?, status = ?, remarks = ?, total_qty = ?, total_value = ?, updated_at = CURRENT_TIMESTAMP
          WHERE po_number = ?
        `).run(actualBuyer, season, floor, delivery_date, priority, status, remarks, total_qty, total_value, trimmedPO);

        const existingProducts = db.prepare('SELECT * FROM po_products WHERE po_number = ?').all(trimmedPO) as any[];
        
        // Match incoming products that don't have an ID with the existing ones by style, color, size
        products.forEach((p: any) => {
          if (!p.id) {
            const match = existingProducts.find((ep: any) => 
              String(ep.style_num || '').trim().toLowerCase() === String(p.style_num || '').trim().toLowerCase() &&
              String(ep.color || '').trim().toLowerCase() === String(p.color || '').trim().toLowerCase() &&
              String(ep.size || '').trim().toLowerCase() === String(p.size || '').trim().toLowerCase()
            ) as any;
            if (match) {
              p.id = match.id;
            }
          }
        });

        const incomingProductIds = products.filter((p: any) => p.id).map((p: any) => p.id);
        const existingProductIds = existingProducts.map((p: any) => p.id);
        const toDelete = existingProductIds.filter(id => !incomingProductIds.includes(id));

        for (const id of toDelete) {
          const hasRecords = 
            db.prepare('SELECT 1 FROM cut_records WHERE product_id = ?').get(id) ||
            db.prepare('SELECT 1 FROM stitch_records WHERE product_id = ?').get(id) ||
            db.prepare('SELECT 1 FROM send_records WHERE product_id = ?').get(id) ||
            db.prepare('SELECT 1 FROM pack_records WHERE product_id = ?').get(id) ||
            db.prepare('SELECT 1 FROM finish_records WHERE product_id = ?').get(id) ||
            db.prepare('SELECT 1 FROM fabric_records WHERE po_number = ?').get(trimmedPO);

          if (hasRecords) {
            throw new Error(`Cannot remove product (ID: ${id}) because it has existing production records. Please clear records first.`);
          }
          db.prepare('DELETE FROM po_products WHERE id = ?').run(id);
        }

        const upsertProduct = db.prepare(`
          INSERT INTO po_products (id, po_number, line_num, style_num, item_num, description, color, size, size_ratio, qty, unit_price, total_value, fabric_type, gsm, country, ship_mode, priority, delivery_date, custom_data, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            line_num = excluded.line_num,
            style_num = excluded.style_num,
            item_num = excluded.item_num,
            description = excluded.description,
            color = excluded.color,
            size = excluded.size,
            size_ratio = excluded.size_ratio,
            qty = excluded.qty,
            unit_price = excluded.unit_price,
            total_value = excluded.total_value,
            fabric_type = excluded.fabric_type,
            gsm = excluded.gsm,
            country = excluded.country,
            ship_mode = excluded.ship_mode,
            priority = excluded.priority,
            delivery_date = excluded.delivery_date,
            custom_data = excluded.custom_data,
            sort_order = excluded.sort_order
        `);

        products.forEach((p: any, idx: number) => {
          upsertProduct.run(
            p.id || null,
            trimmedPO,
            p.line_num ?? null,
            p.style_num ?? null,
            p.item_num ?? null,
            p.description ?? null,
            p.color ? normalizeToFullForm(p.color) : null,
            p.size ?? null,
            p.size_ratio ?? null,
            p.qty ?? 0,
            p.unit_price ?? 0,
            (p.qty || 0) * (p.unit_price || 0),
            p.fabric_type ?? null,
            p.gsm ?? null,
            p.country ?? null,
            p.ship_mode ?? null,
            p.priority ?? 'Normal',
            p.delivery_date ?? null,
            JSON.stringify(p.custom_data || {}),
            idx
          );
        });
      } else {
        // --- INSERT mode ---
        db.prepare(`
          INSERT INTO production_orders (po_number, buyer, season, floor, delivery_date, priority, status, remarks, total_qty, total_value, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          trimmedPO,
          actualBuyer ?? null,
          season ?? null,
          floor ?? null,
          delivery_date ?? null,
          priority ?? 'Normal',
          status ?? 'Active',
          remarks ?? null,
          total_qty ?? 0,
          total_value ?? 0,
          req.user?.id ?? null
        );

        const insertProduct = db.prepare(`
          INSERT INTO po_products (po_number, line_num, style_num, item_num, description, color, size, size_ratio, qty, unit_price, total_value, fabric_type, gsm, country, ship_mode, priority, delivery_date, custom_data, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        products.forEach((p: any, idx: number) => {
          insertProduct.run(
            trimmedPO,
            p.line_num ?? null,
            p.style_num ?? null,
            p.item_num ?? null,
            p.description ?? null,
            p.color ? normalizeToFullForm(p.color) : null,
            p.size ?? null,
            p.size_ratio ?? null,
            p.qty ?? 0,
            p.unit_price ?? 0,
            (p.qty || 0) * (p.unit_price || 0),
            p.fabric_type ?? null,
            p.gsm ?? null,
            p.country ?? null,
            p.ship_mode ?? null,
            p.priority ?? 'Normal',
            p.delivery_date ?? null,
            JSON.stringify(p.custom_data || {}),
            idx
          );
        });
      }
    });

    try {
      transaction();
      autoReallocateUnallocatedForPO(trimmedPO);
      if (existingPO) {
        logAudit(req.user.id, 'UPDATE', 'production_orders', trimmedPO, existingPO, { buyer: actualBuyer, season, floor, total_qty });
      } else {
        logAudit(req.user.id, 'CREATE', 'production_orders', trimmedPO, null, { buyer: actualBuyer, season, floor, total_qty });
      }
      res.status(existingPO ? 200 : 201).json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Update generic PO (using PUT request)
router.put('/po/:po_number',
  authenticateToken,
  authorize(['supervisor'], ['Admin']),
  body('products').isArray({ min: 1 }).withMessage('At least one product is required'),
  validate,
  (req: any, res) => {
    const po_number = req.params.po_number.trim();
    const { buyer, season, floor, delivery_date, priority, status, remarks, products } = req.body;
    
    const existingPO: any = db.prepare('SELECT * FROM production_orders WHERE po_number = ?').get(po_number);
    if (!existingPO) return res.status(404).json({ error: 'PO not found' });

    const total_qty = products.reduce((sum: number, p: any) => sum + (p.qty || 0), 0);
    const total_value = products.reduce((sum: number, p: any) => sum + ((p.qty || 0) * (p.unit_price || 0)), 0);
    const actualBuyer = determineBuyersFromProducts(products, buyer);

    const transaction = db.transaction(() => {
      // 1. Update main PO record
      db.prepare(`
        UPDATE production_orders 
        SET buyer = ?, season = ?, floor = ?, delivery_date = ?, priority = ?, status = ?, remarks = ?, total_qty = ?, total_value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE po_number = ?
      `).run(
        actualBuyer ?? null,
        season ?? null,
        floor ?? null,
        delivery_date ?? null,
        priority ?? 'Normal',
        status ?? 'Active',
        remarks ?? null,
        total_qty ?? 0,
        total_value ?? 0,
        po_number
      );

      // 2. Manage products
      const existingProducts = db.prepare('SELECT * FROM po_products WHERE po_number = ?').all(po_number) as any[];
      
      // Match incoming products that don't have an ID with the existing ones by style, color, size
      products.forEach((p: any) => {
        if (!p.id) {
          const match = existingProducts.find((ep: any) => 
            String(ep.style_num || '').trim().toLowerCase() === String(p.style_num || '').trim().toLowerCase() &&
            String(ep.color || '').trim().toLowerCase() === String(p.color || '').trim().toLowerCase() &&
            String(ep.size || '').trim().toLowerCase() === String(p.size || '').trim().toLowerCase()
          ) as any;
          if (match) {
            p.id = match.id;
          }
        }
      });

      const incomingProductIds = products.filter((p: any) => p.id).map((p: any) => p.id);
      const existingProductIds = existingProducts.map((p: any) => p.id);
      
      // Delete products that are no longer in the list (if they don't have production data)
      const toDelete = existingProductIds.filter(id => !incomingProductIds.includes(id));
      for (const id of toDelete) {
        // Check if has any stage records
        const hasRecords = 
          db.prepare('SELECT 1 FROM cut_records WHERE product_id = ?').get(id) ||
          db.prepare('SELECT 1 FROM stitch_records WHERE product_id = ?').get(id) ||
          db.prepare('SELECT 1 FROM send_records WHERE product_id = ?').get(id) ||
          db.prepare('SELECT 1 FROM pack_records WHERE product_id = ?').get(id) ||
          db.prepare('SELECT 1 FROM finish_records WHERE product_id = ?').get(id) ||
          db.prepare('SELECT 1 FROM fabric_records WHERE po_number = ?').get(po_number); // Fabric is usually PO-wide but still check

        if (hasRecords) {
          throw new Error(`Cannot remove product (ID: ${id}) because it has existing production records. Please clear records first.`);
        }
        db.prepare('DELETE FROM po_products WHERE id = ?').run(id);
      }

      const upsertProduct = db.prepare(`
        INSERT INTO po_products (id, po_number, line_num, style_num, item_num, description, color, size, size_ratio, qty, unit_price, total_value, fabric_type, gsm, country, ship_mode, priority, delivery_date, custom_data, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          line_num = excluded.line_num,
          style_num = excluded.style_num,
          item_num = excluded.item_num,
          description = excluded.description,
          color = excluded.color,
          size = excluded.size,
          size_ratio = excluded.size_ratio,
          qty = excluded.qty,
          unit_price = excluded.unit_price,
          total_value = excluded.total_value,
          fabric_type = excluded.fabric_type,
          gsm = excluded.gsm,
          country = excluded.country,
          ship_mode = excluded.ship_mode,
          priority = excluded.priority,
          delivery_date = excluded.delivery_date,
          custom_data = excluded.custom_data,
          sort_order = excluded.sort_order
      `);

      products.forEach((p: any, idx: number) => {
        upsertProduct.run(
          p.id || null,
          po_number,
          p.line_num ?? null,
          p.style_num ?? null,
          p.item_num ?? null,
          p.description ?? null,
          p.color ? normalizeToFullForm(p.color) : null,
          p.size ?? null,
          p.size_ratio ?? null,
          p.qty ?? 0,
          p.unit_price ?? 0,
          (p.qty || 0) * (p.unit_price || 0),
          p.fabric_type ?? null,
          p.gsm ?? null,
          p.country ?? null,
          p.ship_mode ?? null,
          p.priority ?? 'Normal',
          p.delivery_date ?? null,
          JSON.stringify(p.custom_data || {}),
          idx
        );
      });
    });

    try {
      transaction();
      autoReallocateUnallocatedForPO(po_number);
      logAudit(req.user.id, 'UPDATE', 'production_orders', po_number, existingPO, { buyer: actualBuyer, season, total_qty });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Delete generic PO
router.delete('/po/:po_number', authenticateToken, authorize(['supervisor'], ['Admin']), (req: any, res) => {
  const po_number = req.params.po_number?.trim();
  if (!po_number) return res.status(400).json({ error: 'PO Number is required' });

  const upperPO = po_number.toUpperCase();
  if (upperPO === 'UNIVERSAL' || upperPO.startsWith('UNALLOCATED')) {
    return res.status(400).json({ error: `Deletion of virtual PO "${po_number}" is strictly restricted.` });
  }

  const po: any = db.prepare('SELECT * FROM production_orders WHERE po_number = ?').get(po_number);
  if (!po) return res.status(404).json({ error: `PO ${po_number} not found` });

  try {
    db.prepare('DELETE FROM production_orders WHERE po_number = ?').run(po_number);
    logAudit(req.user.id, 'DELETE', 'production_orders', po_number, po);
    res.json({ success: true });
  } catch (e: any) {
    console.error('Delete PO failed:', e);
    res.status(500).json({ error: 'Failed to delete PO: ' + e.message });
  }
});

// Auto-reallocate unallocated stock (cutting, feeding, stitching, finishing, packing) to this official PO
export function autoReallocateUnallocatedForPO(poNumber: string) {
  try {
    // 1. Get all active product specifications on this PO
    const targetProducts = db.prepare(`
      SELECT id, style_num, color, size 
      FROM po_products 
      WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
    `).all(poNumber) as any[];

    if (targetProducts.length === 0) return;

    const tables = [
      'cut_records',
      'send_records',
      'stitch_records',
      'finish_records',
      'pack_records'
    ];

    for (const prod of targetProducts) {
      const style = prod.style_num;
      const color = prod.color;
      const size = prod.size;

      for (const table of tables) {
        // Find unallocated records of the same Style and Size
        const unallocatedRecords = db.prepare(`
          SELECT r.id, p.color as unallocated_color, r.quantity
          FROM ${table} r
          JOIN po_products p ON r.product_id = p.id
          WHERE r.po_number LIKE 'UNALLOCATED%'
            AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
            AND r.status = 'accepted'
        `).all(style, size) as any[];

        for (const rec of unallocatedRecords) {
          // Normalize both colors using general mapping & unified matcher
          const existingColors = [color];
          const mappedColor = getUnifiedColor(rec.unallocated_color, existingColors);

          if (mappedColor.toUpperCase().trim() === color.toUpperCase().trim()) {
            // Reallocate this record to the official PO and target product ID
            db.prepare(`
              UPDATE ${table} 
              SET po_number = ?, product_id = ? 
              WHERE id = ?
            `).run(poNumber, prod.id, rec.id);

            console.log(`[Auto-Reallocate] Moved record ID ${rec.id} in ${table} to PO "${poNumber}" / Product ID: ${prod.id}`);
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`[Auto-Reallocate] Error auto-reallocating unallocated pool to PO ${poNumber}:`, err);
  }
}

export default router;
