import { Router } from 'express';
import { db, logAudit, findPO, getRecordTimestamp } from '../db';
import { authenticateToken, authorize } from '../middleware';

const router = Router();

// Get cutting records
router.get('/cutting', authenticateToken, (req, res) => {
  const returnsByProduct: Record<number, number> = {};
  try {
    const returns = db.prepare(`
      SELECT product_id, SUM(quantity) as total_returned 
      FROM return_records 
      WHERE from_department = 'Feeding' AND to_department = 'Cutting' AND status = 'accepted'
      GROUP BY product_id
    `).all() as any[];
    returns.forEach(r => {
      returnsByProduct[r.product_id] = r.total_returned;
    });
  } catch (err) {
    console.error('Failed to query return_records in cutting GET', err);
  }

  const records = db.prepare(`
    SELECT c.*, p.style_num, p.color, p.size, p.line_num, u.full_name as creator_name, po.buyer
    FROM cut_records c
    JOIN po_products p ON c.product_id = p.id
    JOIN production_orders po ON c.po_number = po.po_number
    LEFT JOIN users u ON c.created_by = u.id
    ORDER BY c.created_at DESC
  `).all() as any[];

  // Adjust in reverse chronological order (newest to oldest)
  records.forEach(c => {
    if (c.status === 'accepted') {
      const returned = returnsByProduct[c.product_id] || 0;
      if (returned > 0) {
        if (c.quantity >= returned) {
          c.quantity -= returned;
          returnsByProduct[c.product_id] = 0;
        } else {
          returnsByProduct[c.product_id] -= c.quantity;
          c.quantity = 0;
        }
      }
    }
  });

  const filteredRecords = records.filter(c => c.quantity > 0 || c.status === 'rejected');
  res.json(filteredRecords);
});

// Submit cutting records (bulk) and validate fabric consumption
router.post('/cutting/bulk', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const { records, fabric_consumption, bypass_fabric_check } = req.body;
  
  const isInitialStockMode = req.headers['x-initial-stock-mode'] === 'true';

  const timestamp = getRecordTimestamp(req);

  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO cut_records (po_number, product_id, quantity, status, created_by, created_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const stockCheck = db.prepare(`
      SELECT COALESCE(SUM(CASE 
        WHEN record_type = 'issue' AND status = 'accepted' THEN quantity_kg 
        WHEN record_type = 'return' THEN -quantity_kg 
        WHEN record_type = 'consumption' THEN -quantity_kg 
        ELSE 0 
      END), 0) as available_kg
      FROM fabric_records
      WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?)) 
        AND UPPER(TRIM(color)) = UPPER(TRIM(?))
        AND UPPER(TRIM(COALESCE(fabric_name, ''))) = UPPER(TRIM(COALESCE(?, '')))
    `);

    const insertConsumption = db.prepare(`
      INSERT INTO fabric_records (po_number, style_num, fabric_name, gsm, record_type, color, quantity_kg, created_by, created_at, status)
      VALUES (TRIM(?), TRIM(?), ?, ?, 'consumption', TRIM(?), ?, ?, ?, 'accepted')
    `);

    // 1. Validate and Insert Fabric Consumption
    if (fabric_consumption && Array.isArray(fabric_consumption)) {
      fabric_consumption.forEach((c: any) => {
        if (!bypass_fabric_check && !isInitialStockMode && parseFloat(c.quantity_kg) > 0) {
          const stock: any = stockCheck.get(c.po_number, c.color, c.fabric_name);
          if (stock.available_kg < c.quantity_kg) {
            throw new Error(`Insufficient stock of ${c.color} (${c.fabric_name || 'Standard'}) for PO ${c.po_number}. Available: ${stock.available_kg.toFixed(2)}kg, Required: ${c.quantity_kg.toFixed(2)}kg`);
          }
        }
        if (parseFloat(c.quantity_kg) > 0) {
          insertConsumption.run(c.po_number, c.style_num, c.fabric_name || null, c.gsm || null, c.color, c.quantity_kg, req.user.id, timestamp);
        }
      });
    }

    // 2. Insert Cut Records
    records.forEach((r: any) => {
      if (r.quantity > 0) {
        const poObj = findPO(r.po_number);
        const finalPo = poObj ? poObj.po_number : r.po_number;
        const pid = parseInt(String(r.product_id));
        console.log(`[Cutting] BULK INSERT: PO=${r.po_number}->${finalPo}, PID=${r.product_id}->${pid}, Qty=${r.quantity}, Time=${timestamp}`);
        stmt.run(finalPo, pid, r.quantity, isInitialStockMode ? 'accepted' : 'pending', req.user.id, timestamp);
      }
    });
  });

  try {
    transaction();
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Delete cut record
router.delete('/cutting/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const old: any = db.prepare('SELECT * FROM cut_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot delete an entry that has already been accepted/rejected by the next department' });
  }
  db.prepare('DELETE FROM cut_records WHERE id = ?').run(req.params.id);
  if (old) logAudit(req.user.id, 'DELETE', 'cut_records', req.params.id, old);
  res.json({ success: true });
});

// Update cut record quantity
router.put('/cutting/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const { quantity } = req.body;
  const old: any = db.prepare('SELECT * FROM cut_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot edit an entry that has already been accepted/rejected by the next department' });
  }
  db.prepare('UPDATE cut_records SET quantity = ? WHERE id = ?').run(quantity, parseInt(req.params.id));
  if (old) logAudit(req.user.id, 'UPDATE', 'cut_records', req.params.id, old, { quantity });
  res.json({ success: true });
});

// Get PO products status query
router.get('/cutting/po-products/:po_number', authenticateToken, (req, res) => {
  const poNum = req.params.po_number.trim();
  const po = findPO(poNum);
  if (!po) return res.status(404).json({ error: `PO not found: "${poNum}"` });

  const finalPoNum = po.po_number.trim();
  const lineNumber = req.query.line_number as string;

  const products = db.prepare(`
    SELECT p.*, 
    (SELECT COALESCE(planned_qty, 0) FROM cutting_programs WHERE product_id = p.id AND UPPER(TRIM(po_number)) = UPPER(TRIM(?))) as planned_qty,
    (SELECT COALESCE(SUM(quantity), 0) FROM cut_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0) - 
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Feeding') -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Cutting') as total_cut,
    (SELECT COALESCE(SUM(quantity), 0) FROM cut_records WHERE product_id = p.id AND status = 'accepted') - 
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Feeding') -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Cutting') as total_accepted_cut,
    (SELECT COALESCE(SUM(quantity), 0) FROM send_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0) -
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching') -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Sending') as total_sent,
    (SELECT COALESCE(SUM(quantity), 0) FROM send_records WHERE product_id = p.id AND status = 'accepted' ${lineNumber ? 'AND line_number = ?' : ''}) -
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${lineNumber ? 'AND line_number = ?' : ''}) -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Sending') as total_accepted_sent,
    (SELECT COALESCE(SUM(quantity), 0) FROM stitch_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${lineNumber ? 'AND line_number = ?' : ''}) -
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${lineNumber ? 'AND line_number = ?' : ''}) -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Stitching') as total_stitched,
    (SELECT COALESCE(SUM(quantity), 0) FROM stitch_records WHERE product_id = p.id AND status = 'accepted' ${lineNumber ? 'AND line_number = ?' : ''}) -
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${lineNumber ? 'AND line_number = ?' : ''}) -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Stitching') as total_accepted_stitched,
    (SELECT COALESCE(SUM(quantity), 0) FROM finish_records WHERE product_id = p.id AND result = 'pass' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0) -
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Packing') -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Finishing') as total_finished,
    (SELECT COALESCE(SUM(quantity), 0) FROM finish_records WHERE product_id = p.id AND result = 'pass' AND status = 'accepted') -
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Packing') -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Finishing') as total_accepted_finished,
    (SELECT COALESCE(SUM(quantity), 0) FROM finish_records WHERE product_id = p.id AND result = 'pass' AND status = 'accepted') -
    (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Packing') -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Finishing') -
    (SELECT COALESCE(SUM(quantity), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'blister' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0) -
    (SELECT COALESCE(SUM(quantity), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 1 AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0) -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Packing - Loose') as total_loose_available,
    (SELECT COALESCE(SUM(quantity), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'blister' AND status = 'accepted') -
    (SELECT COALESCE(SUM(quantity), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 0 AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0) -
    (SELECT COALESCE(SUM(quantity), 0) FROM discard_records WHERE product_id = p.id AND department = 'Packing - Blister') as total_blister_available,
    (SELECT COALESCE(SUM(quantity), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'blister' AND status = 'accepted') as total_accepted_blister_qty,
    (SELECT COALESCE(SUM(quantity), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted') as total_accepted_packed_qty,
    (SELECT COALESCE(SUM(cartons), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted') as total_accepted_cartons,
    (SELECT COALESCE(SUM(quantity), 0) FROM shipment_records WHERE product_id = p.id) as total_shipped
    FROM po_products p
    WHERE UPPER(TRIM(p.po_number)) = UPPER(TRIM(?))
  `).all(...(lineNumber ? [finalPoNum, lineNumber, lineNumber, lineNumber, lineNumber, lineNumber, lineNumber, finalPoNum] : [finalPoNum, finalPoNum])) as any[];
  
  const processedProducts = products.map(p => ({
    ...p,
    original_qty: p.qty,
    qty: Math.max(0, (p.qty || 0) - (p.total_shipped || 0))
  }));

  const colors = [...new Set(processedProducts.map((p: any) => p.color))];
  res.json({ colors, products: processedProducts });
});

// Cutting summary stats
router.get('/cutting/summary', authenticateToken, (req, res) => {
  const summary = db.prepare(`
    SELECT p.po_number, p.id as product_id, p.style_num, p.color, p.size, p.qty as order_qty,
    (SELECT COALESCE(SUM(quantity), 0) FROM cut_records WHERE product_id = p.id) - (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Feeding') as total_cut,
    (SELECT COALESCE(SUM(quantity), 0) FROM send_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0) - (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching') as total_sent,
    COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as total_shipped
    FROM po_products p
  `).all() as any[];

  const processed = summary.map(p => ({
    ...p,
    order_qty: Math.max(0, (p.order_qty || 0) - (p.total_shipped || 0))
  }));

  res.json(processed);
});

// Get sending records
router.get('/sending', authenticateToken, (req, res) => {
  const returnsByProduct: Record<number, number> = {};
  try {
    const returns = db.prepare(`
      SELECT product_id, SUM(quantity) as total_returned 
      FROM return_records 
      WHERE from_department = 'Stitching' AND to_department = 'Feeding' AND status = 'accepted'
      GROUP BY product_id
    `).all() as any[];
    returns.forEach(r => {
      returnsByProduct[r.product_id] = r.total_returned;
    });
  } catch (err) {
    console.error('Failed to query return_records in sending GET', err);
  }

  const records = db.prepare(`
    SELECT s.*, p.style_num, p.color, p.size, u.full_name as dispatcher_name
    FROM send_records s
    JOIN po_products p ON s.product_id = p.id
    LEFT JOIN users u ON s.created_by = u.id
    ORDER BY s.created_at DESC
  `).all() as any[];

  // Adjust in reverse chronological order (newest to oldest)
  records.forEach(s => {
    if (s.status === 'accepted') {
      const returned = returnsByProduct[s.product_id] || 0;
      if (returned > 0) {
        if (s.quantity >= returned) {
          s.quantity -= returned;
          returnsByProduct[s.product_id] = 0;
        } else {
          returnsByProduct[s.product_id] -= s.quantity;
          s.quantity = 0;
        }
      }
    }
  });

  const filteredRecords = records.filter(s => s.quantity > 0 || s.status === 'rejected');
  res.json(filteredRecords);
});

// Dispatch cut work to stitching lines
router.post('/sending', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const { po_number, product_id, quantity, line_number } = req.body;
  const qty = parseInt(String(quantity));
  
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  
  const timestamp = getRecordTimestamp(req);
  
  const isInitialStockMode = req.headers['x-initial-stock-mode'] === 'true';

  const transaction = db.transaction(() => {
    // Validate vs cut stock (Exclude rejected dispatches from total_sent)
    const cutTotal: any = db.prepare("SELECT SUM(quantity) as total FROM cut_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
    const returnsFromFeeding: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Feeding'").get(product_id);
    const discardedCutting: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Cutting'").get(product_id);
    
    const sentTotal: any = db.prepare("SELECT SUM(quantity) as total FROM send_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
    const returnsFromStitching: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Stitching'").get(product_id);

    const totalCut = (cutTotal?.total || 0) - (returnsFromFeeding?.total || 0) - (discardedCutting?.total || 0);
    const totalSent = (sentTotal?.total || 0) - (returnsFromStitching?.total || 0);
    const available = totalCut - totalSent;
    
    if (!isInitialStockMode && quantity > available) throw new Error(`Insufficient cut stock. Available: ${available}, Requested: ${quantity}`);
    
    db.prepare(`
      INSERT INTO send_records (po_number, product_id, quantity, line_number, status, created_by, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(po_number, product_id, quantity, line_number, isInitialStockMode ? 'accepted' : 'pending', req.user.id, timestamp);
  });

  try {
    transaction();
    logAudit(req.user.id, 'CREATE', 'send_records', product_id, null, { po_number, quantity, line_number });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update sending record quantity
router.put('/sending/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const { quantity } = req.body;
  const old: any = db.prepare('SELECT * FROM send_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot edit sending record that has already been accepted/rejected by the next department' });
  }
  db.prepare('UPDATE send_records SET quantity = ? WHERE id = ?').run(quantity, parseInt(req.params.id));
  if (old) logAudit(req.user.id, 'UPDATE', 'send_records', req.params.id, old, { quantity });
  res.json({ success: true });
});

// Delete sending record
router.delete('/sending/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const old: any = db.prepare('SELECT * FROM send_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot delete sending record that has already been accepted/rejected by the next department' });
  }
  db.prepare('DELETE FROM send_records WHERE id = ?').run(req.params.id);
  if (old) logAudit(req.user.id, 'DELETE', 'send_records', req.params.id, old);
  res.json({ success: true });
});

// Get active cutting POs list
router.get('/cutting/active-pos', authenticateToken, (req, res) => {
  const pos = db.prepare(`
    SELECT DISTINCT po.*,
    (SELECT COUNT(*) FROM po_products WHERE po_number = po.po_number) as product_count,
    (SELECT GROUP_CONCAT(DISTINCT style_num) FROM po_products WHERE po_number = po.po_number) as styles,
    (SELECT GROUP_CONCAT(DISTINCT color) FROM po_products WHERE po_number = po.po_number) as colors
    FROM production_orders po
    JOIN cutting_programs cp ON po.po_number = cp.po_number
    WHERE po.status = 'Active'
    ORDER BY po.created_at DESC
  `).all();
  res.json(pos);
});

// Get all cutting programs
router.get('/cutting-programs/all', authenticateToken, (req, res) => {
  const programs = db.prepare(`
    SELECT cp.product_id, cp.product_id AS id, cp.po_number, SUM(cp.planned_qty) as planned_qty, 
           p.style_num, p.color, p.size, p.qty as order_qty,
           COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = cp.product_id), 0) as total_shipped
    FROM cutting_programs cp
    JOIN po_products p ON cp.product_id = p.id
    GROUP BY cp.product_id, cp.po_number
  `).all() as any[];

  const processed = programs.map(p => ({
    ...p,
    order_qty: Math.max(0, (p.order_qty || 0) - (p.total_shipped || 0))
  }));

  res.json(processed);
});

// Get rejection shortfalls for active POs causing a shortage below order quantity
router.get('/cutting-programs/shortfalls', authenticateToken, (req, res) => {
  try {
    const shortfalls = db.prepare(`
      SELECT p.id, p.po_number, p.style_num, p.color, p.size, p.qty as order_qty,
             COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = p.id AND status != 'rejected'), 0) as total_cut,
             COALESCE((SELECT SUM(quantity) FROM finish_records WHERE product_id = p.id AND result = 'reject' AND status != 'rejected'), 0) as total_rejected,
             COALESCE((SELECT SUM(planned_qty) FROM cutting_programs WHERE product_id = p.id), 0) as total_planned,
             COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as total_shipped
      FROM po_products p
      JOIN production_orders po ON p.po_number = po.po_number
      WHERE po.status = 'Active'
    `).all() as any[];

    const result = shortfalls
      .map(p => {
        const remaining_order_qty = Math.max(0, (p.order_qty || 0) - (p.total_shipped || 0));
        const totalCut = p.total_cut || 0;
        const totalRejected = p.total_rejected || 0;
        const maxPotential = totalCut - totalRejected;
        const shortfall = remaining_order_qty - maxPotential;
        
        return {
          ...p,
          order_qty: remaining_order_qty,
          shortfall
        };
      })
      .filter(p => p.total_rejected > 0 && p.shortfall > 0);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get cutting programs by PO
router.get('/cutting-programs/:po_number', authenticateToken, (req, res) => {
  const po = findPO(req.params.po_number);
  if (!po) return res.json([]);

  const programs = db.prepare(`
    SELECT cp.product_id, cp.product_id AS id, cp.po_number, SUM(cp.planned_qty) as planned_qty, 
           p.style_num, p.color, p.size, p.qty as order_qty,
           COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = cp.product_id AND status != 'rejected'), 0) as prev_cut_qty,
           COALESCE((SELECT SUM(quantity) FROM finish_records WHERE product_id = cp.product_id AND result = 'reject' AND status != 'rejected'), 0) as total_rejected,
           COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = cp.product_id), 0) as total_shipped
    FROM cutting_programs cp
    JOIN po_products p ON cp.product_id = p.id
    WHERE cp.po_number = ?
    GROUP BY cp.product_id, cp.po_number
  `).all(po.po_number) as any[];

  const processedPrograms = programs.map(p => ({
    ...p,
    order_qty: Math.max(0, (p.order_qty || 0) - (p.total_shipped || 0))
  }));

  res.json(processedPrograms);
});

// Get all products for cutting initialize
router.get('/po-products-for-cutting/:po_number', authenticateToken, (req, res) => {
  const po = findPO(req.params.po_number);
  if (!po) return res.json([]);

  const products = db.prepare(`
    SELECT p.*, 
           COALESCE((SELECT SUM(planned_qty) FROM cutting_programs WHERE product_id = p.id AND po_number = ?), 0) as planned_qty,
           COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = p.id AND status != 'rejected'), 0) as prev_cut_qty,
           COALESCE((SELECT SUM(quantity) FROM finish_records WHERE product_id = p.id AND result = 'reject' AND status != 'rejected'), 0) as total_rejected,
           COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as total_shipped,
           COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND status = 'accepted' AND packing_type = 'carton'), 0) as total_accepted_packed_qty,
           COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND status = 'accepted' AND packing_type = 'blister'), 0) as total_accepted_blister_qty
    FROM po_products p
    WHERE p.po_number = ?
  `).all(po.po_number, po.po_number) as any[];

  const processedProducts = products.map(p => ({
    ...p,
    original_qty: p.qty,
    qty: Math.max(0, (p.qty || 0) - (p.total_shipped || 0))
  }));

  res.json(processedProducts);
});

// Get colors by style across all active POs
router.get('/cutting/colors-by-style', authenticateToken, (req, res) => {
  const styleNum = (req.query.style_num as string || '').trim();
  if (!styleNum) return res.status(400).json({ error: 'style_num is required' });

  const rows = db.prepare(`
    SELECT DISTINCT p.color 
    FROM po_products p
    JOIN production_orders po ON p.po_number = po.po_number
    WHERE po.status = 'Active' AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
    ORDER BY p.color ASC
  `).all(styleNum) as any[];

  res.json(rows.map(r => r.color).filter(Boolean));
});

// Get all products for a style and color across all active POs
router.get('/cutting/products-by-style', authenticateToken, (req, res) => {
  const styleNum = (req.query.style_num as string || '').trim();
  const color = (req.query.color as string || '').trim();
  if (!styleNum || !color) {
    return res.status(400).json({ error: 'style_num and color are required' });
  }

  const products = db.prepare(`
    SELECT p.*, po.buyer,
           COALESCE((SELECT SUM(planned_qty) FROM cutting_programs WHERE product_id = p.id AND UPPER(TRIM(po_number)) = UPPER(TRIM(p.po_number))), 0) as planned_qty,
           COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = p.id AND status != 'rejected'), 0) as prev_cut_qty,
           COALESCE((SELECT SUM(quantity) FROM finish_records WHERE product_id = p.id AND result = 'reject' AND status != 'rejected'), 0) as total_rejected,
           COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as total_shipped,
           COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND status = 'accepted' AND packing_type = 'carton'), 0) as total_accepted_packed_qty,
           COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND status = 'accepted' AND packing_type = 'blister'), 0) as total_accepted_blister_qty
    FROM po_products p
    JOIN production_orders po ON p.po_number = po.po_number
    WHERE po.status = 'Active'
      AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
      AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
  `).all(styleNum, color) as any[];

  const processedProducts = products.map(p => ({
    ...p,
    original_qty: p.qty,
    qty: Math.max(0, (p.qty || 0) - (p.total_shipped || 0))
  }));

  res.json(processedProducts);
});

// Create single cutting program planning
router.post('/cutting-programs', authenticateToken, (req: any, res) => {
  const { po_number, product_id, planned_qty } = req.body;
  const po = findPO(po_number);
  const finalPoNum = po ? po.po_number : po_number;
  
  const timestamp = getRecordTimestamp(req);

  try {
    db.prepare('DELETE FROM cutting_programs WHERE product_id = ?').run(product_id);
    db.prepare(`
      INSERT INTO cutting_programs (po_number, product_id, planned_qty, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(finalPoNum, product_id, parseInt(planned_qty) || 0, req.user.id, timestamp);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk create cutting programs
router.post('/cutting-programs/bulk', authenticateToken, (req: any, res) => {
  const { po_number, records } = req.body;
  const po = findPO(po_number);
  const finalPoNum = po ? po.po_number : po_number;
  
  const timestamp = getRecordTimestamp(req);

  const transaction = db.transaction((data: any[]) => {
    const getPoStmt = db.prepare(`SELECT po_number FROM po_products WHERE id = ?`);
    const deleteStmt = db.prepare(`DELETE FROM cutting_programs WHERE product_id = ?`);
    const stmt = db.prepare(`
      INSERT INTO cutting_programs (po_number, product_id, planned_qty, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of data) {
      if (r.planned_qty > 0) {
        deleteStmt.run(r.product_id);
        let realPoNum = finalPoNum;
        if ((!po || finalPoNum === 'STYLE-WISE') && r.product_id) {
          const row: any = getPoStmt.get(r.product_id);
          if (row?.po_number) {
            realPoNum = row.po_number;
          }
        }
        stmt.run(realPoNum, r.product_id, parseInt(r.planned_qty), req.user.id, timestamp);
      }
    }
  });

  try {
    transaction(records);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Clear cutting programs of specific style and color
router.post('/cutting-programs/clear', authenticateToken, (req: any, res) => {
  const { style_num, color, po_number } = req.body;
  
  if (!style_num || !color) {
    return res.status(400).json({ error: 'style_num and color are required' });
  }

  try {
    let deleteQuery = `
      DELETE FROM cutting_programs 
      WHERE product_id IN (
        SELECT id FROM po_products 
        WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?)) 
          AND UPPER(TRIM(color)) = UPPER(TRIM(?))
          ${po_number ? 'AND UPPER(TRIM(po_number)) = UPPER(TRIM(?))' : ''}
      )
    `;
    const params = po_number ? [style_num, color, po_number] : [style_num, color];
    db.prepare(deleteQuery).run(...params);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
