import { Router } from 'express';
import { db, logAudit, getRecordTimestamp } from '../db';
import { authenticateToken } from '../middleware';

const router = Router();

// Get all press records
router.get('/press', authenticateToken, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT p.*, u.full_name as operator_name
      FROM press_records p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `).all() as any[];
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch press records', message: err.message });
  }
});

// Create a press record
router.post('/press', authenticateToken, (req: any, res) => {
  const { pcs_pressed } = req.body;
  const qty = parseInt(String(pcs_pressed));

  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Number of pieces pressed must be a positive number' });
  }

  const recordTimestamp = getRecordTimestamp(req);

  try {
    const result = db.prepare(`
      INSERT INTO press_records (pcs_pressed, created_by, created_at)
      VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(qty, req.user.id, recordTimestamp);

    logAudit(req.user.id, 'CREATE', 'press_records', Number(result.lastInsertRowid), null, { pcs_pressed: qty });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a press record
router.delete('/press/:id', authenticateToken, (req: any, res) => {
  try {
    const old: any = db.prepare('SELECT * FROM press_records WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Record not found' });
    
    db.prepare('DELETE FROM press_records WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'DELETE', 'press_records', req.params.id, old);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
