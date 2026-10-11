import { Router } from 'express';
import { db, logAudit, getRecordTimestamp } from '../db';
import { authenticateToken } from '../middleware';

const router = Router();

// Handover Logic
router.post('/handovers/confirm', authenticateToken, (req: any, res) => {
  const { table, ids, action } = req.body;
  const userRole = req.user.role;
  const userDept = req.user.department;

  if (userRole === 'viewer') return res.status(403).json({ error: 'Viewer only' });
  
  // Validate table vs Department
  // We allow supervisors and operators of the RECEIVING department to confirm.
  // send_records -> Cutting to Stitching. Stitching confirms.
  // stitch_records -> Stitching to Finishing. Finishing confirms.
  // finish_records -> Finishing to Packing. Packing confirms.
  // pack_records -> Packing to Store. Store confirms.
  const deptMapping: Record<string, string | ((req: any) => string)> = {
    'fabric_records': 'Cutting',
    'cut_records': 'Cutting',
    'send_records': 'Stitching',
    'stitch_records': 'Finishing',
    'finish_records': 'Packing',
    'pack_records': (req: any) => {
      // Allow Packing to confirm internal QC
      // Allow Finishing to confirm direct carton QC
      // Allow Store/Shipping to confirm intake
      if (req.user.department === 'Packing') return 'Packing';
      if (req.user.department === 'Finishing') return 'Finishing';
      if (req.user.department === 'Shipping') return 'Shipping';
      return 'Store';
    }
  };

  const mapping = deptMapping[table];
  const requiredDept = typeof mapping === 'function' ? mapping(req) : mapping;
  const isUniversalSupervisor = userRole === 'supervisor' && String(userDept).toLowerCase() === 'all';
  
  let allowedDepts: string[] = [];
  if (userDept) allowedDepts.push(String(userDept));
  if (Array.isArray(req.user.allowed_departments)) {
    allowedDepts.push(...req.user.allowed_departments.map(String));
  }
  const hasDeptAccess = allowedDepts.some(d => d.trim().toLowerCase() === String(requiredDept).trim().toLowerCase());

  if (userRole !== 'admin' && !isUniversalSupervisor && requiredDept && !hasDeptAccess) {
    return res.status(403).json({ error: `Only ${requiredDept} department can confirm this handover` });
  }

  const validTables = ['fabric_records', 'cut_records', 'send_records', 'stitch_records', 'finish_records', 'pack_records'];
  
  if (!validTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });
  if (!['accepted', 'rejected'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

  try {
    const timestamp = getRecordTimestamp(req);
    
    // Update logic for handovers
    const { statusField } = req.body;
    let targetField = statusField || 'status';
    
    // Auto-detect for pack_records if not specified
    if (table === 'pack_records' && !statusField) {
      if (req.user.department === 'Store' || req.user.department === 'Shipping') {
        targetField = 'store_status';
      }
    }

    const stmt = db.prepare(`
      UPDATE ${table} 
      SET ${targetField} = ?, 
          received_by = ?, 
          received_at = COALESCE(?, CURRENT_TIMESTAMP)
      WHERE id = ? AND ${targetField} = ?
    `);

    const transaction = db.transaction((idList: number[]) => {
      let processedCount = 0;
      let requiredStatus = 'pending';
      // Allow BOTH pending and in_transit for store_status to prevent blockage if dispatch step was skipped
      if (targetField === 'store_status') {
        for (const id of idList) {
          let result = stmt.run(action, req.user.id, timestamp, id, 'in_transit');
          if (result.changes === 0) {
            result = stmt.run(action, req.user.id, timestamp, id, 'pending');
          }
          if (result.changes > 0) processedCount++;
        }
      } else {
        for (const id of idList) {
          // If direct carton pack, also sync linked record
          if (table === 'pack_records') {
            const pRec: any = db.prepare('SELECT * FROM pack_records WHERE id = ?').get(id);
            if (pRec && pRec.is_direct_carton) {
              db.prepare(`
                UPDATE finish_records 
                SET status = ?, received_by = ?, received_at = COALESCE(?, CURRENT_TIMESTAMP) 
                WHERE po_number = ? AND product_id = ? AND is_direct_carton = 1 AND status = 'pending' AND created_at = ?
              `).run(action, req.user.id, timestamp, pRec.po_number, pRec.product_id, pRec.created_at);
            }
          } else if (table === 'finish_records') {
            const fRec: any = db.prepare('SELECT * FROM finish_records WHERE id = ?').get(id);
            if (fRec && fRec.is_direct_carton) {
              db.prepare(`
                UPDATE pack_records 
                SET status = ?, received_by = ?, received_at = COALESCE(?, CURRENT_TIMESTAMP) 
                WHERE po_number = ? AND product_id = ? AND is_direct_carton = 1 AND status = 'pending' AND created_at = ?
              `).run(action, req.user.id, timestamp, fRec.po_number, fRec.product_id, fRec.created_at);
            }
          }

          const result = stmt.run(action, req.user.id, timestamp, id, requiredStatus);
          if (result.changes > 0) processedCount++;
        }
      }
      if (processedCount === 0 && idList.length > 0) {
        throw new Error('No pending records found or already processed');
      }
      return processedCount;
    });

    const count = transaction(ids);
    logAudit(req.user.id, 'CONFIRM_HANDOVER', table, ids.join(','), { status: 'pending' }, { status: action, count });
    res.json({ success: true, processedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
