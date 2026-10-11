import { Router } from 'express';
import { db, logAudit, getRecordTimestamp } from '../db';
import { authenticateToken } from '../middleware';

const router = Router();

// Submit bulk returns
router.post('/returns/bulk', authenticateToken, (req: any, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items provided for bulk return' });
  }

  const promptMap: Record<string, string> = {
    'Packing': 'Finishing',
    'Finishing': 'Stitching',
    'Stitching': 'Feeding',
    'Feeding': 'Cutting'
  };

  const userMap: Record<string, string> = {
    'Cutting': 'Feeding',
    'Stitching': 'Stitching',
    'Finishing': 'Finishing',
    'Packing': 'Packing'
  };

  const recordTimestamp = getRecordTimestamp(req);

  try {
    const transaction = db.transaction(() => {
      for (const item of items) {
        const { po_number, product_id, from_department, to_department, quantity, reason, line_number } = item;
        const lineNum = line_number || item.line_num || item.line || null;
        const qty = parseInt(String(quantity));
        if (isNaN(qty) || qty <= 0) continue;

        const expectedToDept = promptMap[from_department];
        if (!expectedToDept) {
          throw new Error(`Returns are not allowed from ${from_department || 'this department'}`);
        }
        if (to_department !== expectedToDept) {
          throw new Error(`Return logic is limited to immediate previous department. ${from_department} can only return to ${expectedToDept}`);
        }

        const requiredCreatorDept = userMap[from_department];
        if (req.user.role !== 'admin' && requiredCreatorDept && req.user.department !== requiredCreatorDept) {
          throw new Error(`Only workers in ${requiredCreatorDept} department can initiate a return from ${from_department}`);
        }

        // Check availability
        if (from_department === 'Feeding') {
          const prod: any = db.prepare("SELECT qty FROM po_products WHERE id = ?").get(product_id);
          const cutTotal: any = db.prepare("SELECT SUM(quantity) as total FROM cut_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
          const returnsFromFeeding: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Feeding'").get(product_id);
          const sentTotal: any = db.prepare("SELECT SUM(quantity) as total FROM send_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
          const returnsFromStitching: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Stitching'").get(product_id);

          const effectiveCut = (cutTotal?.total || 0) > 0 ? (cutTotal?.total || 0) : (prod?.qty || 0);
          const totalCut = effectiveCut - (returnsFromFeeding?.total || 0);
          const totalSent = (sentTotal?.total || 0) - (returnsFromStitching?.total || 0);
          const available = Math.max(0, totalCut - totalSent);

          if (qty > available) throw new Error(`Insufficient cut stock to return for Product #${product_id}. Available: ${available}, Requested: ${qty}`);
        } else if (from_department === 'Stitching') {
          const lineFilter = lineNum ? "AND line_number = ?" : "";
          const lineParams = lineNum ? [product_id, lineNum] : [product_id];

          const receivedTotal: any = db.prepare(`SELECT SUM(quantity) as total FROM send_records WHERE product_id = ? AND status = 'accepted' ${lineFilter}`).get(...lineParams);
          const returnsFromStitching: any = db.prepare(`SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Stitching' ${lineFilter}`).get(...lineParams);
          const stitchedTotal: any = db.prepare(`SELECT SUM(quantity) as total FROM stitch_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${lineFilter}`).get(...lineParams);
          const returnsFromFinishing: any = db.prepare(`SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Finishing' ${lineFilter}`).get(...lineParams);

          const totalReceived = (receivedTotal?.total || 0) - (returnsFromStitching?.total || 0);
          const totalStitched = (stitchedTotal?.total || 0) - (returnsFromFinishing?.total || 0);
          const available = Math.max(0, totalReceived - totalStitched);

          if (qty > available) throw new Error(`Insufficient stitched stock to return for Product #${product_id}. Available: ${available}, Requested: ${qty}`);
        } else if (from_department === 'Finishing') {
          const stitchTotal: any = db.prepare("SELECT SUM(quantity) as total FROM stitch_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
          const returnsFromFinishing: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Finishing'").get(product_id);
          const finishedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
          const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Packing'").get(product_id);

          const totalAcceptedStitched = (stitchTotal?.total || 0) - (returnsFromFinishing?.total || 0);
          const totalFinished = (finishedTotal?.total || 0) - (returnsFromPacking?.total || 0);
          const available = Math.max(0, totalAcceptedStitched - totalFinished);

          if (qty > available) throw new Error(`Insufficient finished stock to return for Product #${product_id}. Available: ${available}, Requested: ${qty}`);
        } else if (from_department === 'Packing') {
          const finishTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND result = 'pass' AND status = 'accepted'").get(product_id);
          const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Packing'").get(product_id);
          const cartonPackedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'carton' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
          const discardedLoose: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Loose'").get(product_id);
          const discardedBlister: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Blister'").get(product_id);

          const totalPassed = (finishTotal?.total || 0) - (returnsFromPacking?.total || 0);
          const totalCartonPacked = (cartonPackedTotal?.total || 0);
          const totalDiscarded = (discardedLoose?.total || 0) + (discardedBlister?.total || 0);
          const available = Math.max(0, totalPassed - totalCartonPacked - totalDiscarded);

          if (qty > available) throw new Error(`Insufficient packed stock to return for Product #${product_id}. Available: ${available}, Requested: ${qty}`);
        }

        db.prepare(`
          INSERT INTO return_records (
            po_number, product_id, from_department, to_department, quantity, reason, line_number, status, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(po_number, product_id, from_department, to_department, qty, reason || 'Bulk Return to Previous Department', lineNum, req.user.id, recordTimestamp);

        logAudit(req.user.id, 'CREATE', 'return_records', product_id, null, { po_number, quantity: qty, from_department, to_department });
      }
    });

    transaction();
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Get defect returns log
router.get('/returns', authenticateToken, (req: any, res) => {
  const { to_department, from_department, status } = req.query;

  let query = `
    SELECT r.*, p.style_num, p.color, p.size, u1.full_name as creator_name, u2.full_name as receiver_name
    FROM return_records r
    JOIN po_products p ON r.product_id = p.id
    LEFT JOIN users u1 ON r.created_by = u1.id
    LEFT JOIN users u2 ON r.received_by = u2.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (to_department) {
    query += ` AND r.to_department = ?`;
    params.push(to_department);
  }
  if (from_department) {
    query += ` AND r.from_department = ?`;
    params.push(from_department);
  }
  if (status) {
    query += ` AND r.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY r.created_at DESC`;

  const records = db.prepare(query).all(...params);
  res.json(records);
});

// Submit a new return of defect items
router.post('/returns', authenticateToken, (req: any, res) => {
  const { po_number, product_id, from_department, to_department, quantity, reason, line_number } = req.body;
  const lineNum = line_number || req.body.line_num || req.body.line || null;
  const qty = parseInt(String(quantity));
  
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });

  const promptMap: Record<string, string> = {
    'Packing': 'Finishing',
    'Finishing': 'Stitching',
    'Stitching': 'Feeding',
    'Feeding': 'Cutting'
  };

  const expectedToDept = promptMap[from_department];
  if (!expectedToDept) {
    return res.status(400).json({ error: `Returns are not allowed from ${from_department || 'this department'}` });
  }
  if (to_department !== expectedToDept) {
    return res.status(400).json({ error: `Return logic is limited to the immediate previous department. ${from_department} can only return to ${expectedToDept}` });
  }

  const userMap: Record<string, string> = {
    'Cutting': 'Feeding',
    'Stitching': 'Stitching',
    'Finishing': 'Finishing',
    'Packing': 'Packing'
  };
  
  const userRole = req.user.role;
  const userDept = req.user.department;
  const requiredCreatorDept = userMap[from_department];
  const isUniversalSupervisor = String(userRole).toLowerCase() === 'supervisor' && String(userDept).toLowerCase() === 'all';

  let allowedDepts: string[] = [];
  if (userDept) allowedDepts.push(String(userDept));
  if (Array.isArray(req.user.allowed_departments)) {
    allowedDepts.push(...req.user.allowed_departments.map(String));
  }
  const hasDeptAccess = allowedDepts.some(d => d.trim().toLowerCase() === String(requiredCreatorDept).trim().toLowerCase());

  if (userRole !== 'admin' && !isUniversalSupervisor && requiredCreatorDept && !hasDeptAccess) {
    return res.status(403).json({ error: `Only workers in the ${requiredCreatorDept} department can initiate a return from ${from_department}` });
  }

  const recordTimestamp = getRecordTimestamp(req);

  const transaction = db.transaction(() => {
    // Check current accepted/pending stock of target product at target step
    if (from_department === 'Feeding') {
      const prod: any = db.prepare("SELECT qty FROM po_products WHERE id = ?").get(product_id);
      const cutTotal: any = db.prepare("SELECT SUM(quantity) as total FROM cut_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
      const returnsFromFeeding: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Feeding'").get(product_id);
      
      const sentTotal: any = db.prepare("SELECT SUM(quantity) as total FROM send_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
      const returnsFromStitching: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Stitching'").get(product_id);

      const effectiveCut = (cutTotal?.total || 0) > 0 ? (cutTotal?.total || 0) : (prod?.qty || 0);
      const totalCut = effectiveCut - (returnsFromFeeding?.total || 0);
      const totalSent = (sentTotal?.total || 0) - (returnsFromStitching?.total || 0);
      const available = Math.max(0, totalCut - totalSent);

      if (quantity > available) throw new Error(`Insufficient cut stock to return. Available: ${available}, Requested: ${quantity}`);
    } else if (from_department === 'Stitching') {
      const lineFilter = lineNum ? "AND line_number = ?" : "";
      const lineParams = lineNum ? [product_id, lineNum] : [product_id];

      const receivedTotal: any = db.prepare(`SELECT SUM(quantity) as total FROM send_records WHERE product_id = ? AND status = 'accepted' ${lineFilter}`).get(...lineParams);
      const returnsFromStitching: any = db.prepare(`SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Stitching' ${lineFilter}`).get(...lineParams);
      
      const stitchedTotal: any = db.prepare(`SELECT SUM(quantity) as total FROM stitch_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${lineFilter}`).get(...lineParams);
      const returnsFromFinishing: any = db.prepare(`SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Finishing' ${lineFilter}`).get(...lineParams);

      const totalReceived = (receivedTotal?.total || 0) - (returnsFromStitching?.total || 0);
      const totalStitched = (stitchedTotal?.total || 0) - (returnsFromFinishing?.total || 0);
      const available = Math.max(0, totalReceived - totalStitched);

      if (quantity > available) throw new Error(`Insufficient stitched stock to return. Available: ${available}, Requested: ${quantity}`);
    } else if (from_department === 'Finishing') {
      const stitchTotal: any = db.prepare("SELECT SUM(quantity) as total FROM stitch_records WHERE product_id = ? AND status = 'accepted'").get(product_id);
      const returnsFromFinishing: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Finishing'").get(product_id);
      
      const finishedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
      const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status = 'accepted' AND from_department = 'Packing'").get(product_id);

      const totalAcceptedStitched = (stitchTotal?.total || 0) - (returnsFromFinishing?.total || 0);
      const totalFinished = (finishedTotal?.total || 0) - (returnsFromPacking?.total || 0);
      const available = Math.max(0, totalAcceptedStitched - totalFinished);

      if (quantity > available) throw new Error(`Insufficient finished stock to return. Available: ${available}, Requested: ${quantity}`);
    } else if (from_department === 'Packing') {
      const passTotal: any = db.prepare("SELECT SUM(quantity) as total FROM finish_records WHERE product_id = ? AND result = 'pass' AND status = 'accepted'").get(product_id);
      const returnsFromPacking: any = db.prepare("SELECT SUM(quantity) as total FROM return_records WHERE product_id = ? AND status != 'rejected' AND from_department = 'Packing'").get(product_id);
      const cartonPackedTotal: any = db.prepare("SELECT SUM(quantity) as total FROM pack_records WHERE product_id = ? AND packing_type = 'carton' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0").get(product_id);
      const discardedLoose: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Loose'").get(product_id);
      const discardedBlister: any = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM discard_records WHERE product_id = ? AND department = 'Packing - Blister'").get(product_id);

      const totalPassed = (passTotal?.total || 0) - (returnsFromPacking?.total || 0);
      const totalCartonPacked = (cartonPackedTotal?.total || 0);
      const totalDiscarded = (discardedLoose?.total || 0) + (discardedBlister?.total || 0);
      const available = Math.max(0, totalPassed - totalCartonPacked - totalDiscarded);

      if (quantity > available) throw new Error(`Insufficient packed stock to return. Available: ${available}, Requested: ${quantity}`);
    }

    db.prepare(`
      INSERT INTO return_records (po_number, product_id, from_department, to_department, quantity, reason, line_number, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(po_number, product_id, from_department, to_department, quantity, reason || null, lineNum, req.user.id, recordTimestamp);
  });

  try {
    transaction();
    logAudit(req.user.id, 'CREATE', 'return_records', product_id, null, { po_number, quantity, from_department, to_department });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Update status of return (accepted / rejected) by the receiving department
const handleStatusUpdate = (req: any, res: any) => {
  const { status } = req.body;
  const recordId = Number(req.params.id);
  
  console.log(`[RETURNS] Status Update Event Start:`, { recordId, status, user: req.user.username });

  if (isNaN(recordId)) {
    console.warn(`[RETURNS] Failed: Invalid record ID format: ${req.params.id}`);
    return res.status(400).json({ error: 'Invalid record ID format' });
  }

  if (!['accepted', 'rejected'].includes(status)) {
    console.warn(`[RETURNS] Failed: Attempted invalid status "${status}" for record #${recordId}`);
    return res.status(400).json({ error: `Invalid status target: ${status}` });
  }
  
  try {
    const record: any = db.prepare('SELECT * FROM return_records WHERE id = ?').get(recordId);
    if (!record) {
      console.error(`[RETURNS] Failed: Record #${recordId} not found in DB`);
      return res.status(404).json({ error: `Return record #${recordId} does not exist` });
    }

    console.log(`[RETURNS] Found Record State:`, { id: record.id, currentStatus: record.status, toDept: record.to_department });

    const result = db.prepare(`
      UPDATE return_records 
      SET status = ?, received_by = ?, received_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.user.id, recordId);
    
    console.log(`[RETURNS] SQL Update Success for #${recordId}. Changes: ${result.changes}`);

    if (result.changes === 0) {
      console.error(`[RETURNS] SQL Executed but no rows were updated for #${recordId}`);
      return res.status(500).json({ error: 'Database update failed to persist changes' });
    }
    
    const updatedRecord = db.prepare('SELECT * FROM return_records WHERE id = ?').get(recordId);
    console.log(`[RETURNS] Final verification state:`, updatedRecord);
    res.json({ success: true, record: updatedRecord });
  } catch (e: any) {
    console.error(`[RETURNS] Critical Internal Error:`, e.stack || e.message);
    res.status(500).json({ error: `Internal Server Error: ${e.message}` });
  }
};

router.post('/returns/:id/status', authenticateToken, handleStatusUpdate);
router.put('/returns/:id/status', authenticateToken, handleStatusUpdate);

export default router;
