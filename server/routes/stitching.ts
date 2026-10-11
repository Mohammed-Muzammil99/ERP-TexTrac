import { Router } from 'express';
import { db, logAudit, getRecordTimestamp } from '../db';
import { authenticateToken, authorize } from '../middleware';

const router = Router();

// Get stitching records
router.get('/stitching', authenticateToken, (req, res) => {
  const returnsByProduct: Record<number, number> = {};
  try {
    const returns = db.prepare(`
      SELECT product_id, SUM(quantity) as total_returned 
      FROM return_records 
      WHERE from_department = 'Finishing' AND to_department = 'Stitching' AND status = 'accepted'
      GROUP BY product_id
    `).all() as any[];
    returns.forEach(r => {
      returnsByProduct[r.product_id] = r.total_returned;
    });
  } catch (err) {
    console.error('Failed to query return_records in stitching GET', err);
  }

  const records = db.prepare(`
    SELECT s.*, p.style_num, p.color, p.size, u.full_name as dispatcher_name
    FROM stitch_records s
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

// Post stitched quantities with dispatch validation (accepted vs output)
router.post('/stitching', authenticateToken, authorize(['operator', 'supervisor'], ['Stitching']), (req: any, res) => {
  const { po_number, product_id, quantity, line_number } = req.body;
  const qty = parseInt(String(quantity));
  
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });

  const recordTimestamp = getRecordTimestamp(req);

  const isInitialStockMode = req.headers['x-initial-stock-mode'] === 'true';

  const transaction = db.transaction(() => {
    // Validate vs ACCEPTED sent stock (Stitching can only output what was accepted by line)
    const receivedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM send_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
    const returnsFromStitching: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Stitching'").get(product_id);
    const discardedSending: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Sending'").get(product_id);
    
    const stitchedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM stitch_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
    const returnsFromFinishing: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Finishing'").get(product_id);

    const totalReceived = (receivedTotal?.total || 0) - (returnsFromStitching?.total || 0) - (discardedSending?.total || 0);
    const totalStitched = (stitchedTotal?.total || 0) - (returnsFromFinishing?.total || 0);
    const available = totalReceived - totalStitched;

    if (!isInitialStockMode && quantity > available) throw new Error(`Insufficient accepted stock from sending. Available: ${available}, Requested: ${quantity}`);

    db.prepare(`
      INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, created_by, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(po_number, product_id, quantity, line_number, isInitialStockMode ? 'accepted' : 'pending', req.user.id, recordTimestamp);
  });

  try {
    transaction();
    logAudit(req.user.id, 'CREATE', 'stitch_records', product_id, null, { po_number, quantity, line_number });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update stitching record quantity
router.put('/stitching/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Stitching']), (req: any, res) => {
  const { quantity } = req.body;
  const old: any = db.prepare('SELECT * FROM stitch_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot edit stitching record that has already been accepted/rejected by the next department' });
  }
  db.prepare('UPDATE stitch_records SET quantity = ? WHERE id = ?').run(quantity, parseInt(req.params.id));
  if (old) logAudit(req.user.id, 'UPDATE', 'stitch_records', req.params.id, old, { quantity });
  res.json({ success: true });
});

// Delete stitching record
router.delete('/stitching/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Stitching']), (req: any, res) => {
  const old: any = db.prepare('SELECT * FROM stitch_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot delete stitching record that has already been accepted/rejected by the next department' });
  }
  db.prepare('DELETE FROM stitch_records WHERE id = ?').run(req.params.id);
  if (old) logAudit(req.user.id, 'DELETE', 'stitch_records', req.params.id, old);
  res.json({ success: true });
});

export default router;
