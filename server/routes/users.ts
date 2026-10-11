import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { db, logAudit } from '../db';
import { JWT_SECRET, authenticateToken, isAdmin, validate } from '../middleware';
import { enrichAuditLogs } from '../auditEnricher';
import { generateTokensForRequest, executeStockRequisition, executeCuttingConsumptionCorrection } from '../whatsapp';

const router = Router();

function parseJsonArray(val: any): string[] | null {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

// Login
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.is_active === 0 || !bcrypt.compareSync(password, user.hashed_password)) {
    return res.status(401).json({ error: 'Invalid credentials or account is deactivated' });
  }

  const allowedPages = parseJsonArray(user.allowed_pages);
  const allowedDepartments = parseJsonArray(user.allowed_departments);
  const canChangeTime = user.can_change_time === 1 || user.role === 'admin' ? 1 : 0;

  const token = jwt.sign(
    { 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      department: user.department, 
      full_name: user.full_name,
      allowed_pages: allowedPages,
      allowed_departments: allowedDepartments,
      can_change_time: canChangeTime
    }, 
    JWT_SECRET, 
    { expiresIn: '12h' }
  );
  res.json({ 
    access_token: token, 
    token_type: 'bearer', 
    id: user.id,
    username: user.username,
    role: user.role, 
    department: user.department, 
    full_name: user.full_name,
    allowed_pages: allowedPages,
    allowed_departments: allowedDepartments,
    can_change_time: canChangeTime
  });
});

// Profile / Current User
router.get('/auth/me', authenticateToken, (req: any, res) => {
  const user: any = db.prepare('SELECT id, username, full_name, role, department, allowed_pages, allowed_departments, can_change_time, is_active, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    ...user,
    can_change_time: user.can_change_time === 1 || user.role === 'admin' ? 1 : 0,
    allowed_pages: parseJsonArray(user.allowed_pages),
    allowed_departments: parseJsonArray(user.allowed_departments)
  });
});

// Get Users (Admin only)
router.get('/users', authenticateToken, isAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, full_name, role, department, allowed_pages, allowed_departments, can_change_time, is_active, created_at FROM users').all();
  const parsed = users.map((u: any) => ({
    ...u,
    can_change_time: u.can_change_time === 1 || u.role === 'admin' ? 1 : 0,
    allowed_pages: parseJsonArray(u.allowed_pages),
    allowed_departments: parseJsonArray(u.allowed_departments)
  }));
  res.json(parsed);
});

// Create User (Admin only)
router.post('/users', 
  authenticateToken, 
  isAdmin, 
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate,
  (req, res) => {
    const { username, full_name, password, role, department, allowed_pages, allowed_departments, can_change_time } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const pagesStr = allowed_pages ? JSON.stringify(Array.isArray(allowed_pages) ? allowed_pages : [allowed_pages]) : null;
    const deptsStr = allowed_departments ? JSON.stringify(Array.isArray(allowed_departments) ? allowed_departments : [allowed_departments]) : null;
    const canChangeTimeVal = (can_change_time === 1 || can_change_time === true) ? 1 : 0;

    try {
      db.prepare('INSERT INTO users (username, full_name, hashed_password, role, department, allowed_pages, allowed_departments, can_change_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        username, 
        full_name, 
        hashedPassword, 
        role, 
        department || 'Admin',
        pagesStr,
        deptsStr,
        canChangeTimeVal
      );
      res.status(201).json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Username already exists' });
    }
  }
);

// Update User (Admin only)
router.put('/users/:id', authenticateToken, isAdmin, (req, res) => {
  const { username, full_name, password, role, department, is_active, allowed_pages, allowed_departments, can_change_time } = req.body;
  const userId = req.params.id;

  const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (username && username !== user.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
  }

  try {
    const pagesStr = allowed_pages !== undefined ? (allowed_pages ? JSON.stringify(allowed_pages) : null) : user.allowed_pages;
    const deptsStr = allowed_departments !== undefined ? (allowed_departments ? JSON.stringify(allowed_departments) : null) : user.allowed_departments;
    const canChangeTimeVal = can_change_time !== undefined 
      ? ((can_change_time === 1 || can_change_time === true) ? 1 : 0) 
      : (user.can_change_time === 1 ? 1 : 0);

    let query = 'UPDATE users SET username = ?, full_name = ?, role = ?, department = ?, is_active = ?, allowed_pages = ?, allowed_departments = ?, can_change_time = ?';
    const params: any[] = [
      username !== undefined ? username : user.username,
      full_name !== undefined ? full_name : user.full_name,
      role !== undefined ? role : user.role,
      department !== undefined ? department : user.department,
      is_active !== undefined ? (is_active ? 1 : 0) : user.is_active,
      pagesStr,
      deptsStr,
      canChangeTimeVal
    ];

    if (password && password.trim().length > 0) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      query += ', hashed_password = ?';
      const hashedPassword = bcrypt.hashSync(password, 10);
      params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(userId);

    db.prepare(query).run(...params);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to update user', message: e.message });
  }
});

// Delete User (Admin only)
router.delete('/users/:id', authenticateToken, isAdmin, (req, res) => {
  const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });
  
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true, deleted: true });
  } catch (e: any) {
    if (e.message && e.message.includes('FOREIGN KEY')) {
      // Deactivate user instead of hard deleting to preserve transaction integrity
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
      res.json({ 
        success: true, 
        deleted: false, 
        message: 'This user has active transaction logs. Account was deactivated instead of deleted to protect historical records.' 
      });
    } else {
      res.status(500).json({ error: 'Failed to delete user', message: e.message });
    }
  }
});

// View Audit Logs (Admin only)
router.get('/admin/audit-logs', authenticateToken, isAdmin, (req, res) => {
  try {
    const rawLogs = db.prepare(`
      SELECT a.*, u.username, u.full_name, u.role as user_role, u.department as user_department
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 2000
    `).all();

    const enriched = enrichAuditLogs(db, rawLogs);
    res.json(enriched);
  } catch (err: any) {
    console.error('Failed to fetch audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs', message: err.message });
  }
});

// Perform Undo for Audit Log (Admin only)
router.post('/admin/undo-audit-log/:id', authenticateToken, isAdmin, (req: any, res) => {
  const logId = req.params.id;
  const log: any = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(logId);
  if (!log) {
    return res.status(404).json({ error: 'Audit log entry not found' });
  }
  if (log.is_undone === 1) {
    return res.status(400).json({ error: 'This action is already undone' });
  }

  const table = log.table_name;
  const action = log.action;
  const recordId = log.record_id;

  try {
    const transaction = db.transaction(() => {
      let undone = false;
      let undoDetail = '';

      // CASE A: Handover / confirmation undos
      if (action === 'CONFIRM_HANDOVER') {
        const ids = recordId.split(',').map((x: string) => parseInt(x.trim(), 10)).filter(Boolean);
        if (ids.length > 0) {
          if (table === 'pack_records') {
            const stmt = db.prepare(`UPDATE pack_records SET store_status = 'pending', received_by = NULL, received_at = NULL WHERE id = ?`);
            for (const id of ids) {
              stmt.run(id);
            }
          } else {
            const stmt = db.prepare(`UPDATE ${table} SET status = 'pending', received_by = NULL, received_at = NULL WHERE id = ?`);
            for (const id of ids) {
              stmt.run(id);
            }
          }
          undone = true;
          undoDetail = `Reset ${ids.length} confirmed handovers back to pending status in ${table}`;
        }
      } 
      else if (action === 'TRANSFER_TO_STORE') {
        const ids = recordId.split(',').map((x: string) => parseInt(x.trim(), 10)).filter(Boolean);
        if (ids.length > 0) {
          const stmt = db.prepare(`UPDATE pack_records SET store_status = 'pending' WHERE id = ?`);
          for (const id of ids) {
            stmt.run(id);
          }
          undone = true;
          undoDetail = `Replaced ${ids.length} store dispatches back to pending in pack_records`;
        }
      }
      else if (action === 'CLOSE_PO_ARCHIVE' || action === 'REOPEN_PO_ACTIVATE' || action === 'UPDATE_STATUS') {
        if (table === 'production_orders' && log.old_value) {
          const oldValObj = JSON.parse(log.old_value);
          if (oldValObj && oldValObj.status) {
            db.prepare("UPDATE production_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE po_number = ?").run(oldValObj.status, recordId);
            undone = true;
            undoDetail = `Restored production order ${recordId} status back to ${oldValObj.status}`;
          }
        }
      }
      else if (action === 'DIRECT_TIME_CHANGE' || action === 'SET_WORKING_DATE' || action === 'REVERT_TO_REALTIME') {
        // Revert time change
        let oldDateVal: any = null;
        if (log.old_value) {
          try {
            oldDateVal = JSON.parse(log.old_value);
          } catch {
            oldDateVal = log.old_value;
          }
        }

        if (oldDateVal && typeof oldDateVal === 'string' && oldDateVal.trim().length > 0) {
          db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('working_date', ?)").run(oldDateVal);
          undone = true;
          undoDetail = `Restored system working date back to ${oldDateVal}`;
        } else {
          // Revert to realtime (remove working_date setting)
          db.prepare("DELETE FROM system_settings WHERE key = 'working_date'").run();
          undone = true;
          undoDetail = 'Reverted system date back to live realtime clock';
        }
      }
      else if (action === 'DELETE') {
        // Recover deleted record
        if (log.old_value) {
          const oldValObj = JSON.parse(log.old_value);
          const keys = Object.keys(oldValObj);
          if (keys.length > 0) {
            const cols = keys.join(', ');
            const placeholders = keys.map(() => '?').join(', ');
            const params = keys.map(k => oldValObj[k]);
            db.prepare(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`).run(...params);
            undone = true;
            undoDetail = `Recovered and re-inserted a deleted record into ${table} with original ID/data`;
          }
        }
      }
      else if (action === 'UPDATE') {
        // Revert last updated record to its old values
        if (log.old_value) {
          const oldValObj = JSON.parse(log.old_value);
          
          // Verify if table has an id field we can match
          const recordIdNum = parseInt(recordId, 10);
          if (!isNaN(recordIdNum)) {
            const rowExists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(recordIdNum);
            if (rowExists) {
              const keys = Object.keys(oldValObj).filter(k => k !== 'id' && k !== 'created_at');
              const setClause = keys.map(k => `${k} = ?`).join(', ');
              const params = keys.map(k => oldValObj[k]);
              params.push(recordIdNum);
              db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...params);
            } else {
              // Row was subsequently deleted, re-insert old values
              const keys = Object.keys(oldValObj);
              const cols = keys.join(', ');
              const placeholders = keys.map(() => '?').join(', ');
              const params = keys.map(k => oldValObj[k]);
              db.prepare(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`).run(...params);
            }
            undone = true;
            undoDetail = `Restored previous state of updated record ${recordId} in ${table}`;
          } else {
            // Check by non-numeric recordId (like PO Number)
            const rowExists = db.prepare(`SELECT 1 FROM ${table} WHERE po_number = ?`).get(recordId);
            if (rowExists) {
              const keys = Object.keys(oldValObj).filter(k => k !== 'po_number' && k !== 'id' && k !== 'created_at');
              const setClause = keys.map(k => `${k} = ?`).join(', ');
              const params = keys.map(k => oldValObj[k]);
              params.push(recordId);
              db.prepare(`UPDATE ${table} SET ${setClause} WHERE po_number = ?`).run(...params);
              undone = true;
              undoDetail = `Restored previous state of PO ${recordId} in ${table}`;
            }
          }
        }
      }
      else if (action === 'CREATE') {
        // Remove created record
        let isDeleted = false;
        const recordIdNum = parseInt(recordId, 10);
        if (!isNaN(recordIdNum)) {
          const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(recordIdNum);
          if (row) {
            db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(recordIdNum);
            isDeleted = true;
          }
        }
        
        if (!isDeleted && log.new_value) {
          const newValObj = JSON.parse(log.new_value);
          let matchingRow: any = null;
          if (newValObj.po_number && !isNaN(recordIdNum)) {
            // record_id often represents the product_id or row id
            matchingRow = db.prepare(`
              SELECT * FROM ${table} 
              WHERE po_number = ? AND product_id = ? AND quantity = ?
              ORDER BY id DESC LIMIT 1
            `).get(newValObj.po_number, recordIdNum, newValObj.quantity);
          } else if (newValObj.po_number && newValObj.product_id) {
            matchingRow = db.prepare(`
              SELECT * FROM ${table} 
              WHERE po_number = ? AND product_id = ? AND quantity = ?
              ORDER BY id DESC LIMIT 1
            `).get(newValObj.po_number, newValObj.product_id, newValObj.quantity);
          } else if (table === 'press_records' && newValObj.pcs_pressed) {
            matchingRow = db.prepare(`
              SELECT * FROM press_records 
              WHERE pcs_pressed = ? 
              ORDER BY id DESC LIMIT 1
            `).get(newValObj.pcs_pressed);
          } else if (table === 'fabric_records' && newValObj.po_number) {
            matchingRow = db.prepare(`
              SELECT * FROM fabric_records 
              WHERE po_number = ? AND quantity_kg = ?
              ORDER BY id DESC LIMIT 1
            `).get(newValObj.po_number, newValObj.quantity_kg || newValObj.quantity);
          }
          
          if (matchingRow) {
            db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(matchingRow.id);
            isDeleted = true;
          }
        }

        if (isDeleted) {
          undone = true;
          undoDetail = `Removed newly created record from ${table}`;
        }
      }

      if (!undone) {
        throw new Error(`This type of action (${action} on ${table}) does not support automated reversal.`);
      }

      // Mark this audit log as undone
      db.prepare('UPDATE audit_logs SET is_undone = 1 WHERE id = ?').run(logId);

      // Create a log entry trace for the UNDO action itself
      logAudit(
        req.user.id,
        'UNDO_ACTION',
        'audit_logs',
        String(logId),
        { original_action: action, original_table: table },
        { undo_status: 'success', detail: undoDetail },
        req.ip || ''
      );

      return undoDetail;
    });

    const detail = transaction();
    res.json({ success: true, message: `Action undone successfully! ${detail}` });
  } catch (err: any) {
    console.error('Failed to undo action:', err);
    res.status(400).json({ error: err.message || 'Failed to undo action' });
  }
});

// ==========================================
// --- Permission & Date Change Requests ---
// ==========================================

// Submit a new permission or datetime change request
router.post('/permission-requests', authenticateToken, (req: any, res: any) => {
  const { request_type, requested_items, requested_datetime, reason, requisition_data } = req.body;

  if (!['dept_access', 'page_access', 'datetime_change', 'old_stock_requisition', 'cutting_consumption_correction'].includes(request_type)) {
    return res.status(400).json({ error: 'Invalid request_type' });
  }

  if (request_type === 'datetime_change' && (!requested_datetime || typeof requested_datetime !== 'string')) {
    return res.status(400).json({ error: 'Valid requested_datetime is required for date change requests' });
  }

  if ((request_type === 'dept_access' || request_type === 'page_access') && (!requested_items || !Array.isArray(requested_items) || requested_items.length === 0)) {
    return res.status(400).json({ error: 'At least one requested item is required' });
  }

  if (request_type === 'old_stock_requisition') {
    const reqObj = requisition_data || (typeof requested_items === 'object' && !Array.isArray(requested_items) ? requested_items : null);
    if (!reqObj || !reqObj.style_num || !reqObj.color || !reqObj.size || !reqObj.quantity || !reqObj.target_department) {
      return res.status(400).json({ error: 'Missing required garment specs (style_num, color, size, quantity, target_department) for stock requisition' });
    }
  }

  if (request_type === 'cutting_consumption_correction') {
    const reqObj = requisition_data || (typeof requested_items === 'object' && !Array.isArray(requested_items) ? requested_items : null);
    if (!reqObj || !reqObj.fabric_record_id || reqObj.new_quantity_kg === undefined) {
      return res.status(400).json({ error: 'Missing fabric_record_id or new_quantity_kg for consumption correction request' });
    }
  }

  try {
    let itemsJson = requested_items && Array.isArray(requested_items) ? JSON.stringify(requested_items) : null;
    let reqDataJson = requisition_data ? (typeof requisition_data === 'string' ? requisition_data : JSON.stringify(requisition_data)) : null;

    if ((request_type === 'old_stock_requisition' || request_type === 'cutting_consumption_correction') && !reqDataJson && requested_items && typeof requested_items === 'object') {
      reqDataJson = JSON.stringify(requested_items);
      itemsJson = reqDataJson;
    }

    const datetimeVal = requested_datetime ? requested_datetime.trim() : null;

    const result = db.prepare(`
      INSERT INTO permission_requests (user_id, request_type, requested_items, requested_datetime, reason, requisition_data, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(req.user.id, request_type, itemsJson, datetimeVal, reason || '', reqDataJson);

    const newId = result.lastInsertRowid as number;

    // Generate WhatsApp 1-click action tokens immediately
    generateTokensForRequest(newId);

    logAudit(req.user.id, 'CREATE_PERMISSION_REQUEST', 'permission_requests', String(newId), null, {
      request_type,
      requested_items,
      requested_datetime,
      requisition_data: reqDataJson ? JSON.parse(reqDataJson) : null,
      reason
    });

    res.status(201).json({ success: true, id: newId });
  } catch (err: any) {
    console.error('Failed to submit permission request:', err);
    res.status(500).json({ error: 'Failed to submit request', message: err.message });
  }
});

// Get user's own submitted requests
router.get('/permission-requests/my', authenticateToken, (req: any, res: any) => {
  try {
    const rows = db.prepare(`
      SELECT 
        pr.*,
        rev.full_name as reviewer_name
      FROM permission_requests pr
      LEFT JOIN users rev ON pr.reviewed_by = rev.id
      WHERE pr.user_id = ?
      ORDER BY pr.id DESC
    `).all(req.user.id) as any[];

    const requests = rows.map(r => {
      let parsedItems = null;
      if (r.requested_items) {
        try {
          parsedItems = JSON.parse(r.requested_items);
        } catch {
          parsedItems = [r.requested_items];
        }
      }
      let parsedReqData = null;
      if (r.requisition_data) {
        try {
          parsedReqData = JSON.parse(r.requisition_data);
        } catch {
          parsedReqData = null;
        }
      }
      return {
        ...r,
        requested_items: parsedItems,
        requisition_data: parsedReqData
      };
    });

    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch your requests', message: err.message });
  }
});

// Get pending request counts (for badge counters)
router.get('/permission-requests/pending-count', authenticateToken, (req: any, res: any) => {
  try {
    const totalPending: any = db.prepare("SELECT COUNT(*) as count FROM permission_requests WHERE status = 'pending'").get();
    const myPending: any = db.prepare("SELECT COUNT(*) as count FROM permission_requests WHERE user_id = ? AND status = 'pending'").get(req.user.id);
    
    res.json({
      count: totalPending?.count || 0,
      my_pending_count: myPending?.count || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to count pending requests', message: err.message });
  }
});

// Admin: Get all permission requests with filters
router.get('/permission-requests', authenticateToken, isAdmin, (req: any, res: any) => {
  const { status, type } = req.query;

  try {
    let sql = `
      SELECT 
        pr.*,
        u.username as requester_username,
        u.full_name as requester_name,
        u.role as requester_role,
        u.department as requester_department,
        u.allowed_pages as requester_allowed_pages,
        u.allowed_departments as requester_allowed_departments,
        rev.full_name as reviewer_name
      FROM permission_requests pr
      LEFT JOIN users u ON pr.user_id = u.id
      LEFT JOIN users rev ON pr.reviewed_by = rev.id
    `;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (status && status !== 'all') {
      whereClauses.push('pr.status = ?');
      params.push(status);
    }

    if (type && type !== 'all') {
      whereClauses.push('pr.request_type = ?');
      params.push(type);
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += " ORDER BY CASE WHEN pr.status = 'pending' THEN 0 ELSE 1 END, pr.id DESC";

    const rows = db.prepare(sql).all(...params) as any[];

    const requests = rows.map(r => {
      let parsedItems = null;
      if (r.requested_items) {
        try {
          parsedItems = JSON.parse(r.requested_items);
        } catch {
          parsedItems = [r.requested_items];
        }
      }

      let allowedPages = null;
      if (r.requester_allowed_pages) {
        try {
          allowedPages = JSON.parse(r.requester_allowed_pages);
        } catch {
          allowedPages = null;
        }
      }

      let allowedDepts = null;
      if (r.requester_allowed_departments) {
        try {
          allowedDepts = JSON.parse(r.requester_allowed_departments);
        } catch {
          allowedDepts = null;
        }
      }

      let parsedReqData = null;
      let parsedCorrData = null;
      if (r.requisition_data) {
        try {
          const parsed = JSON.parse(r.requisition_data);
          if (r.request_type === 'cutting_consumption_correction') {
            parsedCorrData = parsed;
          } else {
            parsedReqData = parsed;
          }
        } catch {
          parsedReqData = null;
        }
      }

      return {
        ...r,
        requested_items: parsedItems,
        requisition_data: parsedReqData,
        consumption_correction_data: parsedCorrData,
        requester_allowed_pages: allowedPages,
        requester_allowed_departments: allowedDepts
      };
    });

    res.json(requests);
  } catch (err: any) {
    console.error('Failed to fetch permission requests:', err);
    res.status(500).json({ error: 'Database error fetching requests', message: err.message });
  }
});

// Admin: Review (Approve / Reject) a request
router.post('/permission-requests/:id/review', authenticateToken, isAdmin, (req: any, res: any) => {
  const requestId = parseInt(req.params.id);
  const { status, admin_notes } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be either "approved" or "rejected"' });
  }

  try {
    const existingReq: any = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(requestId);
    if (!existingReq) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (existingReq.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${existingReq.status}` });
    }

    let executionDetails: any = null;

    const reviewTx = db.transaction(() => {
      // If approved, execute the corresponding changes
      if (status === 'approved') {
        if (existingReq.request_type === 'old_stock_requisition') {
          let reqData: any = null;
          if (existingReq.requisition_data) {
            try { reqData = JSON.parse(existingReq.requisition_data); } catch { reqData = null; }
          }
          if (!reqData && existingReq.requested_items) {
            try { reqData = typeof existingReq.requested_items === 'string' ? JSON.parse(existingReq.requested_items) : existingReq.requested_items; } catch { reqData = null; }
          }
          if (reqData) {
            executionDetails = executeStockRequisition(reqData, req.user.id, existingReq);
          }
        } else if (existingReq.request_type === 'cutting_consumption_correction') {
          let corrData: any = null;
          if (existingReq.requisition_data) {
            try { corrData = JSON.parse(existingReq.requisition_data); } catch { corrData = null; }
          }
          if (!corrData && existingReq.requested_items) {
            try { corrData = typeof existingReq.requested_items === 'string' ? JSON.parse(existingReq.requested_items) : existingReq.requested_items; } catch { corrData = null; }
          }
          if (corrData) {
            executionDetails = executeCuttingConsumptionCorrection(corrData, req.user.id, existingReq);
          }
        } else if (existingReq.request_type === 'datetime_change' && existingReq.requested_datetime) {
          // Set system working_date
          db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('working_date', ?)").run(existingReq.requested_datetime);
        } else if (existingReq.request_type === 'dept_access' && existingReq.requested_items) {
          const userRow: any = db.prepare('SELECT allowed_departments FROM users WHERE id = ?').get(existingReq.user_id);
          if (userRow) {
            let currentDepts: string[] = [];
            if (userRow.allowed_departments) {
              try {
                currentDepts = JSON.parse(userRow.allowed_departments);
              } catch {
                currentDepts = [];
              }
            }
            let requestedDepts: string[] = [];
            try {
              requestedDepts = JSON.parse(existingReq.requested_items);
            } catch {
              requestedDepts = [existingReq.requested_items];
            }

            const merged = Array.from(new Set([...currentDepts, ...requestedDepts]));
            db.prepare('UPDATE users SET allowed_departments = ? WHERE id = ?').run(JSON.stringify(merged), existingReq.user_id);
          }
        } else if (existingReq.request_type === 'page_access' && existingReq.requested_items) {
          const userRow: any = db.prepare('SELECT allowed_pages FROM users WHERE id = ?').get(existingReq.user_id);
          if (userRow) {
            let currentPages: string[] = [];
            if (userRow.allowed_pages) {
              try {
                currentPages = JSON.parse(userRow.allowed_pages);
              } catch {
                currentPages = [];
              }
            }
            let requestedPages: string[] = [];
            try {
              requestedPages = JSON.parse(existingReq.requested_items);
            } catch {
              requestedPages = [existingReq.requested_items];
            }

            const merged = Array.from(new Set([...currentPages, ...requestedPages]));
            db.prepare('UPDATE users SET allowed_pages = ? WHERE id = ?').run(JSON.stringify(merged), existingReq.user_id);
          }
        }
      }

      const realActualIso = new Date().toISOString();

      // Update the request status
      db.prepare(`
        UPDATE permission_requests
        SET status = ?, reviewed_by = ?, reviewed_at = ?, admin_notes = ?
        WHERE id = ?
      `).run(status, req.user.id, realActualIso, admin_notes || null, requestId);

      // Invalidate WhatsApp tokens so they can't be reused
      db.prepare(`
        UPDATE whatsapp_approval_tokens 
        SET used_at = ? 
        WHERE request_id = ?
      `).run(realActualIso, requestId);

      logAudit(req.user.id, `REVIEW_PERMISSION_REQUEST_${status.toUpperCase()}`, 'permission_requests', String(requestId), {
        previous_status: existingReq.status
      }, {
        new_status: status,
        admin_notes,
        request_type: existingReq.request_type,
        executionDetails
      });
    });

    reviewTx();

    const updated = db.prepare(`
      SELECT 
        pr.*,
        u.username as requester_username,
        u.full_name as requester_name,
        rev.full_name as reviewer_name
      FROM permission_requests pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN users rev ON pr.reviewed_by = rev.id
      WHERE pr.id = ?
    `).get(requestId) as any;

    if (updated && updated.requested_items) {
      try {
        updated.requested_items = JSON.parse(updated.requested_items);
      } catch {
        updated.requested_items = [updated.requested_items];
      }
    }

    res.json({
      success: true,
      message: `Request #${requestId} has been successfully ${status}.`,
      request: updated
    });
  } catch (err: any) {
    console.error('Failed to review permission request:', err);
    res.status(500).json({ error: 'Failed to review request', message: err.message });
  }
});

// System Public App URL configuration (Admin Only)
router.get(['/settings/public-url', '/whatsapp/settings'], authenticateToken, (req: any, res: any) => {
  try {
    const publicUrlRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'public_app_url'").get();
    const phonesRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_admin_phones'").get();
    const enabledRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_enabled'").get();
    const autoDispatchRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_auto_dispatch'").get();

    const configuredUrl = publicUrlRow && publicUrlRow.value ? publicUrlRow.value.trim() : '';
    const dynamicBaseUrl = configuredUrl || (req.get('x-app-url') || req.get('origin') || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

    res.json({
      admin_phones: phonesRow ? phonesRow.value : '',
      enabled: enabledRow ? enabledRow.value === '1' : true,
      auto_dispatch: autoDispatchRow ? autoDispatchRow.value === '1' : true,
      public_app_url: configuredUrl,
      is_configured: Boolean(configuredUrl && configuredUrl.startsWith('http')),
      effective_base_url: dynamicBaseUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch settings', message: err.message });
  }
});

router.post(['/settings/public-url', '/whatsapp/settings'], authenticateToken, isAdmin, (req: any, res: any) => {
  const { public_app_url, admin_phones, enabled, auto_dispatch } = req.body;
  const cleanUrl = public_app_url !== undefined ? String(public_app_url || '').trim().replace(/\/$/, '') : undefined;

  if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return res.status(400).json({ 
      error: 'Invalid URL format. Public URL must begin with http:// or https:// (e.g. https://erp.yourcompany.com)' 
    });
  }

  try {
    const setSetting = (key: string, val: string) => {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)").run(key, val);
    };

    if (admin_phones !== undefined) setSetting('whatsapp_admin_phones', String(admin_phones).trim());
    if (enabled !== undefined) setSetting('whatsapp_enabled', enabled ? '1' : '0');
    if (auto_dispatch !== undefined) setSetting('whatsapp_auto_dispatch', auto_dispatch ? '1' : '0');
    if (cleanUrl !== undefined) setSetting('public_app_url', cleanUrl);

    logAudit(req.user.id, 'SAVE_SYSTEM_SETTINGS', 'system_settings', 'system_config', null, {
      admin_phones,
      enabled,
      auto_dispatch,
      public_app_url: cleanUrl
    });

    res.json({ 
      success: true, 
      message: 'Settings saved successfully.',
      public_app_url: cleanUrl,
      is_configured: Boolean(cleanUrl)
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save settings', message: err.message });
  }
});

export default router;
