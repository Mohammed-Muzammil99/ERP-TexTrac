import { Router } from 'express';
import { db, logAudit, getRecordTimestamp } from '../db';
import { authenticateToken, authorize } from '../middleware';

const router = Router();

// Get packing records
router.get('/packing', authenticateToken, (req, res) => {
  const records = db.prepare(`
    SELECT pk.*, p.style_num, p.color, p.size, u.full_name as dispatcher_name
    FROM pack_records pk
    JOIN po_products p ON pk.product_id = p.id
    LEFT JOIN users u ON pk.created_by = u.id
    ORDER BY pk.created_at DESC
  `).all();
  res.json(records);
});

// Transfer verified karton/packing records to the store (Update to In-Transit status)
router.post('/packing/transfer-to-store', authenticateToken, authorize(['operator', 'supervisor'], ['Packing']), (req: any, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

  try {
    const stmt = db.prepare(`
      UPDATE pack_records 
      SET store_status = 'in_transit' 
      WHERE id = ? AND status = 'accepted' AND store_status = 'pending'
    `);

    const transaction = db.transaction((idList: number[]) => {
      let count = 0;
      for (const id of idList) {
        const result = stmt.run(id);
        if (result.changes > 0) count++;
      }
      return count;
    });

    const processedCount = transaction(ids);
    if (processedCount === 0) throw new Error('No verified records available for transfer');
    
    logAudit(req.user.id, 'TRANSFER_TO_STORE', 'pack_records', ids.join(','), { store_status: 'pending' }, { store_status: 'in_transit' });
    res.json({ success: true, count: processedCount });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Submit packing records
router.post('/packing', authenticateToken, authorize(['operator', 'supervisor'], ['Packing']), (req: any, res) => {
  const { po_number, product_id, quantity, packing_type, cartons, pcs_per_carton, is_direct_carton } = req.body;
  const qty = parseInt(String(quantity));
  const ctns = parseInt(String(cartons || 0));
  const pcsPerCtn = parseInt(String(pcs_per_carton || 0));
  const isDirect = is_direct_carton === true || is_direct_carton === 1 || is_direct_carton === '1';

  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (!['loose', 'blister', 'carton'].includes(packing_type)) return res.status(400).json({ error: 'Invalid packing type' });

  if (packing_type === 'carton') {
    if (isNaN(ctns) || ctns <= 0) return res.status(400).json({ error: 'Cartons count must be a positive number for carton packing' });
    if (isNaN(pcsPerCtn) || pcsPerCtn <= 0) return res.status(400).json({ error: 'Pcs per Carton must be a positive number for carton packing' });
    if (qty !== ctns * pcsPerCtn) {
      return res.status(400).json({ error: `Quantity (${qty}) must match Cartons * Pcs per Carton (${ctns * pcsPerCtn})` });
    }
  }

  const recordTimestamp = getRecordTimestamp(req);

  const isInitialStockMode = req.headers['x-initial-stock-mode'] === 'true';

  const transaction = db.transaction(() => {
    if (!isInitialStockMode) {
      if (packing_type === 'loose') {
        const passTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND result = 'pass' AND status = 'accepted'").get(product_id);
        const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Packing'").get(product_id);
        const discardedFinishing: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Finishing'").get(product_id);
        const discardedLoose: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Loose'").get(product_id);
        
        const packedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'loose' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);

        const totalPassed = (passTotal?.total || 0) - (returnsFromPacking?.total || 0) - (discardedFinishing?.total || 0);
        const totalPacked = (packedTotal?.total || 0) + (discardedLoose?.total || 0);
        const available = totalPassed - totalPacked;

        if (quantity > available) throw new Error(`Insufficient accepted finished stock. Available: ${available}, Requested: ${quantity}`);
      } else if (packing_type === 'blister') {
        const passTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND result = 'pass' AND status = 'accepted'").get(product_id);
        const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Packing'").get(product_id);
        const discardedFinishing: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Finishing'").get(product_id);
        const discardedLoose: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Loose'").get(product_id);
        
        const blisterPackedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'blister' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
        const directCartonPackedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 1 AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);

        const totalPassed = (passTotal?.total || 0) - (returnsFromPacking?.total || 0) - (discardedFinishing?.total || 0);
        const totalUsedLoose = (blisterPackedTotal?.total || 0) + (directCartonPackedTotal?.total || 0) + (discardedLoose?.total || 0);
        const available = totalPassed - totalUsedLoose;

        if (quantity > available) throw new Error(`Insufficient accepted loose finished stock. Available: ${available}, Requested: ${quantity}`);
      } else if (packing_type === 'carton') {
        if (isDirect) {
          const passTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND result = 'pass' AND status = 'accepted'").get(product_id);
          const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Packing'").get(product_id);
          const discardedFinishing: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Finishing'").get(product_id);
          const discardedLoose: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Loose'").get(product_id);
          
          const blisterPackedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'blister' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
          const directCartonPackedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 1 AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);

          const totalPassed = (passTotal?.total || 0) - (returnsFromPacking?.total || 0) - (discardedFinishing?.total || 0);
          const totalUsedLoose = (blisterPackedTotal?.total || 0) + (directCartonPackedTotal?.total || 0) + (discardedLoose?.total || 0);
          const available = totalPassed - totalUsedLoose;

          if (quantity > available) throw new Error(`Insufficient accepted loose stock for direct carton packing. Available: ${available}, Requested: ${quantity}`);
        } else {
          const blisterTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'blister' AND status = 'accepted'").get(product_id);
          const discardedBlister: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Blister'").get(product_id);
          const cartonPackedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 0 AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);

          const totalBlistered = (blisterTotal?.total || 0) - (discardedBlister?.total || 0);
          const totalCartoned = (cartonPackedTotal?.total || 0);
          const available = totalBlistered - totalCartoned;

          if (quantity > available) throw new Error(`Insufficient accepted blister stock. Available: ${available}, Requested: ${quantity}`);
        }
      }
    }

    db.prepare(`
      INSERT INTO pack_records (po_number, product_id, quantity, packing_type, cartons, pcs_per_carton, is_direct_carton, status, store_status, created_by, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(po_number, product_id, quantity, packing_type, packing_type === 'carton' ? ctns : null, packing_type === 'carton' ? pcsPerCtn : null, isDirect ? 1 : 0, isInitialStockMode ? 'accepted' : 'pending', isInitialStockMode ? 'accepted' : 'pending', req.user.id, recordTimestamp);
  });

  try {
    transaction();
    logAudit(req.user.id, 'CREATE', 'pack_records', product_id, null, { po_number, quantity, packing_type, is_direct_carton: isDirect });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update packing record quantity
router.put('/packing/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Packing', 'Finishing']), (req: any, res) => {
  const { quantity, cartons, pcs_per_carton } = req.body;
  const old: any = db.prepare('SELECT * FROM pack_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.store_status !== 'pending') {
    return res.status(400).json({ error: 'Cannot edit packing record that has already been dispatched to Store' });
  }

  const transaction = db.transaction(() => {
    if (cartons && pcs_per_carton) {
      db.prepare('UPDATE pack_records SET quantity = ?, cartons = ?, pcs_per_carton = ? WHERE id = ?').run(quantity, cartons, pcs_per_carton, parseInt(req.params.id));
    } else {
      db.prepare('UPDATE pack_records SET quantity = ? WHERE id = ?').run(quantity, parseInt(req.params.id));
    }

    if (old.is_direct_carton) {
      db.prepare(`
        UPDATE finish_records 
        SET quantity = ? 
        WHERE po_number = ? AND product_id = ? AND is_direct_carton = 1 AND created_at = ?
      `).run(quantity, old.po_number, old.product_id, old.created_at);
    }
  });

  transaction();
  if (old) logAudit(req.user.id, 'UPDATE', 'pack_records', req.params.id, old, { quantity, cartons, pcs_per_carton });
  res.json({ success: true });
});

// Delete packing record
router.delete('/packing/:id', authenticateToken, authorize(['operator', 'supervisor'], ['Packing', 'Finishing']), (req: any, res) => {
  const old: any = db.prepare('SELECT * FROM pack_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  if (old.store_status !== 'pending') {
    return res.status(400).json({ error: 'Cannot delete packing record that has already been dispatched to Store' });
  }

  const transaction = db.transaction(() => {
    if (old.is_direct_carton) {
      db.prepare(`
        DELETE FROM finish_records 
        WHERE po_number = ? AND product_id = ? AND is_direct_carton = 1 AND created_at = ?
      `).run(old.po_number, old.product_id, old.created_at);
    }
    db.prepare('DELETE FROM pack_records WHERE id = ?').run(req.params.id);
  });

  transaction();
  if (old) logAudit(req.user.id, 'DELETE', 'pack_records', req.params.id, old);
  res.json({ success: true });
});

export default router;
