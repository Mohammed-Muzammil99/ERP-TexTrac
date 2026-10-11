import { Router } from 'express';
import { db, logAudit } from '../db';
import { authenticateToken } from '../middleware';

const router = Router();

// Get all discard records
router.get('/discards', authenticateToken, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT d.*, p.style_num, p.color, p.size, u.full_name as created_by_name
      FROM discard_records d
      JOIN po_products p ON d.product_id = p.id
      LEFT JOIN users u ON d.created_by = u.id
      ORDER BY d.created_at DESC
    `).all() as any[];
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch discard records', message: err.message });
  }
});

// Create a discard record
router.post('/discards', authenticateToken, (req: any, res) => {
  const { po_number, product_id, department, quantity, reason } = req.body;
  const qty = parseInt(String(quantity));

  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
  }

  if (!po_number || !product_id || !department) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    db.prepare(`
      INSERT INTO discard_records (po_number, product_id, department, quantity, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(po_number, product_id, department, qty, reason || null, req.user.id);

    logAudit(req.user.id, 'CREATE', 'discard_records', product_id, null, { po_number, department, quantity: qty, reason });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a discard record
router.delete('/discards/:id', authenticateToken, (req: any, res) => {
  try {
    const old: any = db.prepare('SELECT * FROM discard_records WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Record not found' });
    
    db.prepare('DELETE FROM discard_records WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'DELETE', 'discard_records', req.params.id, old);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
