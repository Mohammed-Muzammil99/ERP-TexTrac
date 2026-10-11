import { Router } from 'express';
import { db, logAudit, getRecordTimestamp } from '../db';
import { authenticateToken, authorize } from '../middleware';

const router = Router();

// Get finishing records
router.get('/finishing', authenticateToken, (req, res) => {
  const returnsByProduct: Record<number, number> = {};
  try {
    const returns = db.prepare(`
      SELECT product_id, SUM(quantity) as total_returned 
      FROM return_records 
      WHERE from_department = 'Packing' AND to_department = 'Finishing' AND status = 'accepted'
      GROUP BY product_id
    `).all() as any[];
    returns.forEach(r => {
      returnsByProduct[r.product_id] = r.total_returned;
    });
  } catch (err) {
    console.error('Failed to query return_records in finishing GET', err);
  }

  const records = db.prepare(`
    SELECT f.*, p.style_num, p.color, p.size, u.full_name as dispatcher_name
    FROM finish_records f
    JOIN po_products p ON f.product_id = p.id
    LEFT JOIN users u ON f.created_by = u.id
    ORDER BY f.created_at DESC
  `).all() as any[];

  // Adjust in reverse chronological order (newest to oldest)
  records.forEach(f => {
    if (f.result === 'pass' && f.status === 'accepted') {
      const returned = returnsByProduct[f.product_id] || 0;
      if (returned > 0) {
        if (f.quantity >= returned) {
          f.quantity -= returned;
          returnsByProduct[f.product_id] = 0;
        } else {
          returnsByProduct[f.product_id] -= f.quantity;
          f.quantity = 0;
        }
      }
    }
  });

  const filteredRecords = records.filter(f => f.quantity > 0 || f.result !== 'pass');
  res.json(filteredRecords);
});

// Submit finishing records (QC)
router.post('/finishing', authenticateToken, authorize(['operator', 'supervisor'], ['Finishing']), (req: any, res) => {
  const { po_number, product_id, quantity, result } = req.body;
  const qty = parseInt(String(quantity));
  
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });

  const recordTimestamp = getRecordTimestamp(req);

  const isInitialStockMode = req.headers['x-initial-stock-mode'] === 'true';

  const transaction = db.transaction(() => {
    // Validate vs ACCEPTED stitched
    const stitchTotal: any = db.prepare("SELECT SUM(quantity) as total FROM stitch_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
    const returnsFromFinishing: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Finishing'").get(product_id);
    const discardedStitching: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Stitching'").get(product_id);
    
    const finishedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
    const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Packing'").get(product_id);

    const totalAcceptedStitched = (stitchTotal?.total || 0) - (returnsFromFinishing?.total || 0) - (discardedStitching?.total || 0);
    const totalFinished = (finishedTotal?.total || 0) - (returnsFromPacking?.total || 0);
    const available = totalAcceptedStitched - totalFinished;

    if (!isInitialStockMode && quantity > available) throw new Error(`Insufficient accepted stitched stock. Available: ${available}, Requested: ${quantity}`);

    const targetStatus = isInitialStockMode ? 'accepted' : (result === 'pass' ? 'pending' : 'accepted');

    db.prepare(`
      INSERT INTO finish_records (po_number, product_id, quantity, result, status, created_by, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(po_number, product_id, quantity, result, targetStatus, req.user.id, recordTimestamp);
  });

  try {
    transaction();
    logAudit(req.user.id, 'CREATE', 'finish_records', product_id, null, { po_number, quantity, result });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Direct Carton Pack from Finishing (Bypasses loose passing and blister process)
router.post('/finishing/direct-carton-pack', authenticateToken, authorize(['operator', 'supervisor'], ['Finishing', 'Packing']), (req: any, res) => {
  const { items, po_number } = req.body;
  const itemList = Array.isArray(items) ? items : [req.body];
  
  if (itemList.length === 0) {
    return res.status(400).json({ error: 'No items provided for direct carton packing' });
  }

  const recordTimestamp = getRecordTimestamp(req);
  const isInitialStockMode = req.headers['x-initial-stock-mode'] === 'true';

  const transaction = db.transaction(() => {
    for (const item of itemList) {
      const { po_number: itemPo, product_id, cartons, pcs_per_carton } = item;
      const ctns = parseInt(String(cartons || 0));
      const pcsPerCtn = parseInt(String(pcs_per_carton || 24));
      const qty = parseInt(String(item.quantity || ctns * pcsPerCtn));

      if (isNaN(ctns) || ctns <= 0) throw new Error('Cartons count must be a positive number');
      if (isNaN(pcsPerCtn) || pcsPerCtn <= 0) throw new Error('Pieces per carton must be a positive number');
      if (qty !== ctns * pcsPerCtn) throw new Error(`Quantity (${qty}) must equal Cartons (${ctns}) * Pcs/Carton (${pcsPerCtn})`);

      if (!isInitialStockMode) {
        // Validate vs ACCEPTED stitched in Finishing
        const stitchTotal: any = db.prepare("SELECT SUM(quantity) as total FROM stitch_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
        const returnsFromFinishing: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Finishing'").get(product_id);
        const discardedStitching: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Stitching'").get(product_id);
        
        const finishedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
        const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Packing'").get(product_id);

        const totalAcceptedStitched = (stitchTotal?.total || 0) - (returnsFromFinishing?.total || 0) - (discardedStitching?.total || 0);
        const totalFinished = (finishedTotal?.total || 0) - (returnsFromPacking?.total || 0);
        const available = totalAcceptedStitched - totalFinished;

        if (qty > available) {
          throw new Error(`Insufficient accepted stitched stock for product ID ${product_id}. Available: ${available}, Requested: ${qty}`);
        }
      }

      const activePo = itemPo || po_number;

      // 1. Record finish_records (status: pending for carton confirmation, or accepted if initial stock mode)
      const recordStatus = isInitialStockMode ? 'accepted' : 'pending';

      db.prepare(`
        INSERT INTO finish_records (po_number, product_id, quantity, result, status, is_direct_carton, received_by, received_at, created_by, created_at) 
        VALUES (?, ?, ?, 'pass', ?, 1, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP))
      `).run(activePo, product_id, qty, recordStatus, req.user.id, recordTimestamp, req.user.id, recordTimestamp);

      // 2. Record pack_records as carton with is_direct_carton = 1 (status pending for carton confirmation, store_status pending for warehouse dispatch)
      db.prepare(`
        INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, is_direct_carton, status, store_status, received_by, received_at, created_by, created_at) 
        VALUES (?, ?, ?, ?, 'carton', ?, 1, ?, 'pending', ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP))
      `).run(activePo, product_id, qty, ctns, pcsPerCtn, recordStatus, req.user.id, recordTimestamp, req.user.id, recordTimestamp);
    }
  });

  try {
    transaction();
    logAudit(req.user.id, 'DIRECT_CARTON_PACK_FROM_FINISHING', 'pack_records', null, null, { itemsCount: itemList.length });
    res.json({ success: true, count: itemList.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update finishing record quantity
router.put('/finishing/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Finishing']), (req: any, res) => {
  const { quantity, cartons, pcs_per_carton } = req.body;
  const old: any = db.prepare('SELECT * FROM finish_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot edit finishing record that has already been accepted/rejected by the next department' });
  }
  
  const transaction = db.transaction(() => {
    db.prepare('UPDATE finish_records SET quantity = ? WHERE id = ?').run(quantity, parseInt(req.params.id));
    if (old.is_direct_carton) {
      if (cartons && pcs_per_carton) {
        db.prepare(`
          UPDATE pack_records 
          SET quantity = ?, cartons = ?, pcs_per_carton = ? 
          WHERE po_number = ? AND product_id = ? AND is_direct_carton = 1 AND status = 'pending' AND created_at = ?
        `).run(quantity, cartons, pcs_per_carton, old.po_number, old.product_id, old.created_at);
      } else {
        db.prepare(`
          UPDATE pack_records 
          SET quantity = ? 
          WHERE po_number = ? AND product_id = ? AND is_direct_carton = 1 AND status = 'pending' AND created_at = ?
        `).run(quantity, old.po_number, old.product_id, old.created_at);
      }
    }
  });

  transaction();
  if (old) logAudit(req.user.id, 'UPDATE', 'finish_records', req.params.id, old, { quantity });
  res.json({ success: true });
});

// Delete finishing record
router.delete('/finishing/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Finishing']), (req: any, res) => {
  const old: any = db.prepare('SELECT * FROM finish_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot delete finishing record that has already been accepted/rejected by the next department' });
  }

  const transaction = db.transaction(() => {
    if (old.is_direct_carton) {
      db.prepare(`
        DELETE FROM pack_records 
        WHERE po_number = ? AND product_id = ? AND is_direct_carton = 1 AND status = 'pending' AND created_at = ?
      `).run(old.po_number, old.product_id, old.created_at);
    }
    db.prepare('DELETE FROM finish_records WHERE id = ?').run(req.params.id);
  });

  transaction();
  if (old) logAudit(req.user.id, 'DELETE', 'finish_records', req.params.id, old);
  res.json({ success: true });
});

export default router;
