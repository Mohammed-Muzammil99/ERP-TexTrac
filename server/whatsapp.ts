import crypto from 'crypto';
import { db, logAudit, getRecordTimestamp, normalizeToFullForm, determineBuyerFromStyle } from './db';

export interface WhatsAppTokenPair {
  approveToken: string;
  rejectToken: string;
  expiresAt: string;
}

export interface RequisitionPayload {
  po_number?: string;
  style_num: string;
  color: string;
  size: string;
  quantity: number;
  target_department: 'feeding' | 'stitching' | 'finishing' | 'packing' | 'carton';
  line_number?: string;
  cartons?: number;
  pcs_per_carton?: number;
  reason?: string;
}

// Generate secure 1-click single-use action tokens for a permission/stock request
export const generateTokensForRequest = (requestId: number, expiryHours = 24): WhatsAppTokenPair => {
  const approveToken = crypto.randomBytes(20).toString('hex');
  const rejectToken = crypto.randomBytes(20).toString('hex');
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  // Delete any prior unused tokens for this request
  db.prepare('DELETE FROM whatsapp_approval_tokens WHERE request_id = ?').run(requestId);

  const insertStmt = db.prepare(`
    INSERT INTO whatsapp_approval_tokens (token, request_id, action, expires_at)
    VALUES (?, ?, ?, ?)
  `);

  insertStmt.run(approveToken, requestId, 'approved', expiresAt);
  insertStmt.run(rejectToken, requestId, 'rejected', expiresAt);

  return { approveToken, rejectToken, expiresAt };
};

// Retrieve tokens for a request or generate if none exist
export const getOrGenerateTokens = (requestId: number): WhatsAppTokenPair => {
  const rows = db.prepare(`
    SELECT token, action, expires_at, used_at 
    FROM whatsapp_approval_tokens 
    WHERE request_id = ?
  `).all(requestId) as any[];

  const approveRow = rows.find(r => r.action === 'approved');
  const rejectRow = rows.find(r => r.action === 'rejected');

  if (approveRow && rejectRow && !approveRow.used_at && !rejectRow.used_at && new Date(approveRow.expires_at) > new Date()) {
    return {
      approveToken: approveRow.token,
      rejectToken: rejectRow.token,
      expiresAt: approveRow.expires_at
    };
  }

  return generateTokensForRequest(requestId);
};

// Format structured WhatsApp notification message
export const formatWhatsAppMessage = (request: any, baseUrl: string, tokens: WhatsAppTokenPair) => {
  const requesterName = request.requester_name || request.full_name || 'Floor Supervisor';
  const username = request.requester_username || request.username || 'user';
  const requesterRole = (request.requester_role || request.role || 'Supervisor').toUpperCase();
  const requesterDept = request.requester_department || request.department || 'Production';

  const approveUrl = `${baseUrl.replace(/\/$/, '')}/api/public/whatsapp-action?token=${tokens.approveToken}&action=approved`;
  const rejectUrl = `${baseUrl.replace(/\/$/, '')}/api/public/whatsapp-action?token=${tokens.rejectToken}&action=rejected`;

  const realTimeStr = new Date().toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  let message = `📦 *GARMENT ERP - APPROVAL REQUEST #${request.id}*\n`;
  message += `────────────────────────────\n`;
  message += `👤 *Requester:* ${requesterName} (@${username})\n`;
  message += `👔 *Role & Dept:* ${requesterRole} (${requesterDept})\n`;
  message += `⏰ *Requested At:* ${realTimeStr}\n`;

  if (request.request_type === 'old_stock_requisition') {
    let reqData: RequisitionPayload | null = null;
    if (request.requisition_data) {
      try {
        reqData = JSON.parse(request.requisition_data);
      } catch {
        reqData = null;
      }
    }
    if (!reqData && request.requested_items) {
      try {
        reqData = typeof request.requested_items === 'string' ? JSON.parse(request.requested_items) : request.requested_items;
      } catch {
        reqData = null;
      }
    }

    message += `🏬 *Request Type:* ⚠️ *OLD STOCK ALLOCATION*\n`;
    message += `🎯 *Target Store:* ${(reqData?.target_department || 'Store').toUpperCase()}${reqData?.line_number ? ` (${reqData.line_number})` : ''}\n`;
    message += `🧵 *Garment Specs:*\n`;
    message += `  • *Style:* ${reqData?.style_num || 'N/A'}\n`;
    message += `  • *Color:* ${reqData?.color || 'N/A'}\n`;
    message += `  • *Size:* ${reqData?.size || 'N/A'}\n`;
    message += `  • *Quantity:* ${reqData?.quantity ? reqData.quantity.toLocaleString() : '0'} pcs\n`;
    if (reqData?.po_number) {
      message += `  • *Target PO:* ${reqData.po_number}\n`;
    }
    if (reqData?.cartons) {
      message += `  • *Cartons:* ${reqData.cartons} ctns (${reqData.pcs_per_carton || '-'} pcs/ctn)\n`;
    }
  } else if (request.request_type === 'cutting_consumption_correction') {
    let corrData: any = null;
    if (request.requisition_data) {
      try {
        corrData = typeof request.requisition_data === 'string' ? JSON.parse(request.requisition_data) : request.requisition_data;
      } catch {
        corrData = null;
      }
    }
    if (!corrData && request.requested_items) {
      try {
        corrData = typeof request.requested_items === 'string' ? JSON.parse(request.requested_items) : request.requested_items;
      } catch {
        corrData = null;
      }
    }

    const diff = Number(corrData?.diff_kg || (Number(corrData?.new_quantity_kg || 0) - Number(corrData?.old_quantity_kg || 0)));
    const diffSign = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);

    message += `✂️ *Request Type:* ⚠️ *CUTTING CONSUMPTION CORRECTION*\n`;
    message += `📋 *PO & Style:* ${corrData?.po_number || 'N/A'} (Style: ${corrData?.style_num || 'N/A'})\n`;
    message += `🧵 *Fabric & Color:* ${corrData?.color || 'N/A'} - ${corrData?.fabric_name || 'Standard'}${corrData?.gsm ? ` (${corrData.gsm} GSM)` : ''}\n`;
    message += `⚖️ *Original Consumption:* ${Number(corrData?.old_quantity_kg || 0).toFixed(2)} KG\n`;
    message += `🔄 *Requested Revision:* *${Number(corrData?.new_quantity_kg || 0).toFixed(2)} KG* (Net: ${diffSign} KG)\n`;
    if (corrData?.total_pcs) {
      const oldPerPc = (Number(corrData.old_quantity_kg) / Number(corrData.total_pcs)).toFixed(3);
      const newPerPc = (Number(corrData.new_quantity_kg) / Number(corrData.total_pcs)).toFixed(3);
      message += `👕 *Per Piece Rate:* ${oldPerPc} ➔ *${newPerPc} kg/pc* (${corrData.total_pcs} pcs)\n`;
    }
  } else if (request.request_type === 'dept_access') {
    let depts = request.requested_items;
    if (typeof depts === 'string') {
      try { depts = JSON.parse(depts); } catch { depts = [depts]; }
    }
    message += `🏬 *Request Type:* Department Access\n`;
    message += `🔑 *Requested Depts:* ${Array.isArray(depts) ? depts.join(', ') : depts || 'N/A'}\n`;
  } else if (request.request_type === 'page_access') {
    let pages = request.requested_items;
    if (typeof pages === 'string') {
      try { pages = JSON.parse(pages); } catch { pages = [pages]; }
    }
    message += `📑 *Request Type:* Page & Feature Access\n`;
    message += `🔑 *Requested Pages:* ${Array.isArray(pages) ? pages.join(', ') : pages || 'N/A'}\n`;
  } else if (request.request_type === 'datetime_change') {
    message += `🕒 *Request Type:* System Date & Time Shift\n`;
    message += `📅 *Target DateTime:* ${request.requested_datetime || 'N/A'}\n`;
  }

  if (request.reason) {
    message += `📝 *Reason:* "${request.reason}"\n`;
  }

  message += `────────────────────────────\n`;
  message += `⚡ *1-TAP REMOTE MOBILE ACTIONS:*\n\n`;
  message += `✅ *APPROVE REQUEST:*\n${approveUrl}\n\n`;
  message += `❌ *REJECT REQUEST:*\n${rejectUrl}\n`;
  message += `────────────────────────────\n`;
  message += `_Links are single-use and expire in 24 hours._`;

  return message;
};

// Execute stock requisition injection upon approval
export const executeStockRequisition = (reqData: RequisitionPayload, userId: number, reqObj: any) => {
  const normStyle = String(reqData.style_num || '').trim();
  const normColor = normalizeToFullForm(reqData.color || 'Standard');
  const normSize = String(reqData.size || 'M').toUpperCase().trim();
  const qty = parseInt(String(reqData.quantity), 10);
  const targetDept = reqData.target_department || 'finishing';

  if (!normStyle || isNaN(qty) || qty <= 0) {
    throw new Error('Invalid requisition garment specifications or quantity');
  }

  // 1. Choose or deduce PO number
  let finalPo = String(reqData.po_number || '').trim();
  if (!finalPo) {
    const buyer = (determineBuyerFromStyle(normStyle) || 'badger').toUpperCase();
    finalPo = `UNALLOCATED_${buyer}`;
  }

  // 2. Ensure PO exists
  const checkPo: any = db.prepare("SELECT po_number FROM production_orders WHERE po_number = ?").get(finalPo);
  if (!checkPo) {
    const buyerRaw = determineBuyerFromStyle(normStyle) || 'badger';
    db.prepare(`
      INSERT INTO production_orders (po_number, buyer, season, floor, status, remarks, total_qty, total_value)
      VALUES (?, ?, 'N/A', 'N/A', 'Active', 'Virtual PO for stock requisition release', 0, 0)
    `).run(finalPo, buyerRaw);
  }

  // 3. Ensure product exists
  const checkProduct: any = db.prepare(`
    SELECT id FROM po_products 
    WHERE po_number = ? 
      AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
      AND UPPER(TRIM(color)) = UPPER(TRIM(?))
      AND UPPER(TRIM(size)) = UPPER(TRIM(?))
    LIMIT 1
  `).get(finalPo, normStyle, normColor, normSize);

  let productId: number;
  if (checkProduct) {
    productId = checkProduct.id;
  } else {
    const insertProd = db.prepare(`
      INSERT INTO po_products (po_number, style_num, color, size, qty, unit_price, total_value)
      VALUES (?, ?, ?, ?, 0, 0, 0)
    `).run(finalPo, normStyle, normColor, normSize);
    productId = insertProd.lastInsertRowid as number;
  }

  const nowTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  let tableInserted = '';
  let recordId: number = 0;

  if (targetDept === 'feeding') {
    const res = db.prepare(`
      INSERT INTO cut_records (po_number, product_id, quantity, status, received_by, received_at, created_by, created_at, is_old_stock)
      VALUES (?, ?, ?, 'accepted', ?, ?, ?, ?, 1)
    `).run(finalPo, productId, qty, userId, nowTimestamp, userId, nowTimestamp);
    tableInserted = 'cut_records';
    recordId = res.lastInsertRowid as number;
  } else if (targetDept === 'stitching') {
    const line = String(reqData.line_number || 'LINE 1').trim();
    const res = db.prepare(`
      INSERT INTO send_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at, is_old_stock)
      VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?, 1)
    `).run(finalPo, productId, qty, line, userId, nowTimestamp, userId, nowTimestamp);
    tableInserted = 'send_records';
    recordId = res.lastInsertRowid as number;
  } else if (targetDept === 'finishing') {
    const line = String(reqData.line_number || 'LINE 1').trim();
    const res = db.prepare(`
      INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at, is_old_stock)
      VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?, 1)
    `).run(finalPo, productId, qty, line, userId, nowTimestamp, userId, nowTimestamp);
    tableInserted = 'stitch_records';
    recordId = res.lastInsertRowid as number;
  } else if (targetDept === 'packing') {
    const res = db.prepare(`
      INSERT INTO finish_records (po_number, product_id, quantity, result, status, received_by, received_at, created_by, created_at, is_old_stock)
      VALUES (?, ?, ?, 'pass', 'accepted', ?, ?, ?, ?, 1)
    `).run(finalPo, productId, qty, userId, nowTimestamp, userId, nowTimestamp);
    tableInserted = 'finish_records';
    recordId = res.lastInsertRowid as number;
  } else if (targetDept === 'carton') {
    const ctnCount = reqData.cartons ? parseInt(String(reqData.cartons), 10) : 1;
    const pcsPerCtn = reqData.pcs_per_carton ? parseInt(String(reqData.pcs_per_carton), 10) : qty;
    const res = db.prepare(`
      INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, status, store_status, received_by, received_at, created_by, created_at, is_old_stock)
      VALUES (?, ?, ?, ?, 'carton', ?, 'accepted', 'accepted', ?, ?, ?, ?, 1)
    `).run(finalPo, productId, qty, ctnCount, pcsPerCtn, userId, nowTimestamp, userId, nowTimestamp);
    tableInserted = 'pack_records';
    recordId = res.lastInsertRowid as number;
  }

  // Log audit trail for the stock issuance
  logAudit(userId, 'CREATE_OLD_STOCK_REQUISITION_ISSUE', tableInserted, recordId, null, {
    po_number: finalPo,
    style_num: normStyle,
    color: normColor,
    size: normSize,
    quantity: qty,
    target_department: targetDept,
    requisition_request_id: reqObj.id
  });

  return { tableInserted, recordId, po_number: finalPo, quantity: qty, targetDept };
};

// Execute cutting consumption correction upon approval
export const executeCuttingConsumptionCorrection = (corrData: any, reviewerId: number, reqObj: any) => {
  const recordId = parseInt(String(corrData.fabric_record_id || corrData.id), 10);
  const newQtyKg = parseFloat(String(corrData.new_quantity_kg));

  if (isNaN(recordId) || isNaN(newQtyKg) || newQtyKg < 0) {
    throw new Error('Invalid fabric consumption correction payload');
  }

  const existingRecord: any = db.prepare('SELECT * FROM fabric_records WHERE id = ?').get(recordId);
  if (!existingRecord) {
    throw new Error(`Fabric consumption record #${recordId} was not found in the database.`);
  }

  const oldQtyKg = parseFloat(String(existingRecord.quantity_kg || 0));

  // Update the consumption record
  db.prepare('UPDATE fabric_records SET quantity_kg = ? WHERE id = ?').run(newQtyKg, recordId);

  // Log in audit log
  logAudit(reviewerId, 'CORRECT_CUTTING_CONSUMPTION', 'fabric_records', String(recordId), {
    quantity_kg: oldQtyKg,
    po_number: existingRecord.po_number,
    style_num: existingRecord.style_num,
    color: existingRecord.color,
    fabric_name: existingRecord.fabric_name,
    gsm: existingRecord.gsm
  }, {
    quantity_kg: newQtyKg,
    diff_kg: newQtyKg - oldQtyKg,
    approval_request_id: reqObj.id,
    reason: reqObj.reason || corrData.reason
  });

  return {
    fabric_record_id: recordId,
    po_number: existingRecord.po_number,
    style_num: existingRecord.style_num,
    color: existingRecord.color,
    old_quantity_kg: oldQtyKg,
    new_quantity_kg: newQtyKg,
    diff_kg: newQtyKg - oldQtyKg
  };
};

export interface RemoteActionOptions {
  token?: string;
  requestId?: number;
  action?: 'approved' | 'rejected' | string;
  ipAddress?: string;
}

// Process Remote 1-Click WhatsApp Action (Approve / Reject)
export const processRemoteWhatsAppAction = (tokenOrOptions: string | RemoteActionOptions, fallbackIp = '') => {
  let token = '';
  let directRequestId: number | undefined = undefined;
  let directAction: 'approved' | 'rejected' = 'approved';
  let ipAddress = fallbackIp;

  if (typeof tokenOrOptions === 'string') {
    token = tokenOrOptions.trim();
  } else if (tokenOrOptions && typeof tokenOrOptions === 'object') {
    token = (tokenOrOptions.token || '').trim();
    directRequestId = tokenOrOptions.requestId;
    if (tokenOrOptions.action) {
      directAction = String(tokenOrOptions.action).toLowerCase() === 'rejected' ? 'rejected' : 'approved';
    }
    if (tokenOrOptions.ipAddress) {
      ipAddress = tokenOrOptions.ipAddress;
    }
  }

  let requestId: number | null = null;
  let targetDecision: 'approved' | 'rejected' = directAction;

  if (token) {
    const tokenRow: any = db.prepare(`
      SELECT * FROM whatsapp_approval_tokens WHERE token = ?
    `).get(token);

    if (tokenRow) {
      if (tokenRow.used_at) {
        return { 
          success: false, 
          error: 'ALREADY_USED', 
          message: `This action was already executed on ${new Date(tokenRow.used_at).toLocaleString()}. Single-use tokens cannot be reused.` 
        };
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        return { success: false, error: 'EXPIRED', message: 'This approval link has expired (24h validity window elapsed).' };
      }

      requestId = tokenRow.request_id;
      targetDecision = tokenRow.action;
    } else if (!directRequestId) {
      return { success: false, error: 'TOKEN_NOT_FOUND', message: 'This approval token does not exist or has already expired.' };
    }
  }

  // Fallback to direct request ID if token was not found or direct ID provided
  if (!requestId && directRequestId) {
    requestId = directRequestId;
    targetDecision = directAction;
  }

  if (!requestId) {
    return { success: false, error: 'INVALID_TOKEN', message: 'Missing or invalid security approval token / request identifier.' };
  }

  const request: any = db.prepare(`
    SELECT pr.*, u.username, u.full_name, u.role, u.department as user_dept 
    FROM permission_requests pr
    JOIN users u ON pr.user_id = u.id
    WHERE pr.id = ?
  `).get(requestId);

  if (!request) {
    return { success: false, error: 'REQUEST_NOT_FOUND', message: `Associated permission request #${requestId} was not found.` };
  }

  if (request.status !== 'pending') {
    if (token) {
      // Mark token used anyway
      db.prepare('UPDATE whatsapp_approval_tokens SET used_at = ? WHERE token = ?').run(new Date().toISOString(), token);
    }
    return { 
      success: false, 
      error: 'ALREADY_REVIEWED', 
      message: `Request #${request.id} has already been ${request.status.toUpperCase()} previously.` 
    };
  }

  // Pick first active admin user ID as reviewer
  const adminUser: any = db.prepare("SELECT id, full_name, username FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1").get();
  const reviewerId = adminUser?.id || request.user_id;

  let executionDetails: any = null;

  const actionTx = db.transaction(() => {
    if (targetDecision === 'approved') {
      if (request.request_type === 'old_stock_requisition') {
        let reqData: RequisitionPayload | null = null;
        if (request.requisition_data) {
          try { reqData = JSON.parse(request.requisition_data); } catch { reqData = null; }
        }
        if (!reqData && request.requested_items) {
          try { reqData = typeof request.requested_items === 'string' ? JSON.parse(request.requested_items) : request.requested_items; } catch { reqData = null; }
        }

        if (reqData) {
          executionDetails = executeStockRequisition(reqData, reviewerId, request);
        }
      } else if (request.request_type === 'cutting_consumption_correction') {
        let corrData: any = null;
        if (request.requisition_data) {
          try {
            corrData = typeof request.requisition_data === 'string' ? JSON.parse(request.requisition_data) : request.requisition_data;
          } catch {
            corrData = null;
          }
        }
        if (!corrData && request.requested_items) {
          try {
            corrData = typeof request.requested_items === 'string' ? JSON.parse(request.requested_items) : request.requested_items;
          } catch {
            corrData = null;
          }
        }
        if (corrData) {
          executionDetails = executeCuttingConsumptionCorrection(corrData, reviewerId, request);
        }
      } else if (request.request_type === 'datetime_change' && request.requested_datetime) {
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('working_date', ?)").run(request.requested_datetime);
      } else if (request.request_type === 'dept_access' && request.requested_items) {
        const userRow: any = db.prepare('SELECT allowed_departments FROM users WHERE id = ?').get(request.user_id);
        if (userRow) {
          let currentDepts: string[] = [];
          if (userRow.allowed_departments) {
            try { currentDepts = JSON.parse(userRow.allowed_departments); } catch { currentDepts = []; }
          }
          let requestedDepts: string[] = [];
          try { requestedDepts = JSON.parse(request.requested_items); } catch { requestedDepts = [request.requested_items]; }
          const merged = Array.from(new Set([...currentDepts, ...requestedDepts]));
          db.prepare('UPDATE users SET allowed_departments = ? WHERE id = ?').run(JSON.stringify(merged), request.user_id);
        }
      } else if (request.request_type === 'page_access' && request.requested_items) {
        const userRow: any = db.prepare('SELECT allowed_pages FROM users WHERE id = ?').get(request.user_id);
        if (userRow) {
          let currentPages: string[] = [];
          if (userRow.allowed_pages) {
            try { currentPages = JSON.parse(userRow.allowed_pages); } catch { currentPages = []; }
          }
          let requestedPages: string[] = [];
          try { requestedPages = JSON.parse(request.requested_items); } catch { requestedPages = [request.requested_items]; }
          const merged = Array.from(new Set([...currentPages, ...requestedPages]));
          db.prepare('UPDATE users SET allowed_pages = ? WHERE id = ?').run(JSON.stringify(merged), request.user_id);
        }
      }
    }

    const realActualIso = new Date().toISOString();

    // Update request record
    db.prepare(`
      UPDATE permission_requests
      SET status = ?, reviewed_by = ?, reviewed_at = ?, admin_notes = ?
      WHERE id = ?
    `).run(
      targetDecision,
      reviewerId,
      realActualIso,
      `Approved remotely via WhatsApp 1-Click Action from IP: ${ipAddress || 'Mobile'}`,
      request.id
    );

    // Invalidate all tokens for this request
    db.prepare(`
      UPDATE whatsapp_approval_tokens 
      SET used_at = ? 
      WHERE request_id = ?
    `).run(realActualIso, request.id);

    // Log in audit log with real actual clock time
    logAudit(
      reviewerId,
      `REVIEW_PERMISSION_REQUEST_${targetDecision.toUpperCase()}`,
      'permission_requests',
      String(request.id),
      { previous_status: 'pending' },
      {
        new_status: targetDecision,
        source: 'whatsapp_remote_1click',
        request_type: request.request_type,
        executionDetails
      },
      ipAddress
    );
  });

  actionTx();

  return {
    success: true,
    action: targetDecision,
    requestId: request.id,
    requestType: request.request_type,
    requesterName: request.full_name,
    username: request.username,
    executionDetails,
    timestamp: new Date().toISOString()
  };
};

// Render Mobile-Optimized HTML feedback page
export const renderActionHtml = (result: any) => {
  const isSuccess = result.success;
  const isApproved = result.action === 'approved';

  const themeColor = isSuccess ? (isApproved ? '#10b981' : '#f59e0b') : '#ef4444';
  const statusTitle = isSuccess 
    ? (isApproved ? 'Request Approved Successfully' : 'Request Rejected')
    : 'Action Failed';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>${statusTitle} - Garment ERP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 24px; max-width: 480px; width: 100%; padding: 32px 24px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
    .badge-icon { width: 72px; height: 72px; border-radius: 50%; background: ${themeColor}20; color: ${themeColor}; border: 2px solid ${themeColor}40; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; color: #ffffff; }
    p.desc { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
    .details-box { background: #0f172a80; border: 1px solid #334155; border-radius: 16px; padding: 16px; text-align: left; font-size: 13px; margin-bottom: 24px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e293b; }
    .row:last-child { border-bottom: none; }
    .label { color: #64748b; font-weight: 600; }
    .val { color: #f1f5f9; font-weight: 700; font-family: ui-monospace, monospace; }
    .btn { display: inline-block; width: 100%; padding: 14px; border-radius: 12px; background: #3b82f6; color: white; text-decoration: none; font-weight: 700; font-size: 14px; text-align: center; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .footer { margin-top: 20px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge-icon">${isSuccess ? (isApproved ? '✓' : '✕') : '⚠️'}</div>
    <h1>${statusTitle}</h1>
    <p class="desc">${result.message || (isApproved ? 'The requested stock/permissions have been verified and processed in the system.' : 'The request has been marked as rejected.')}</p>

    ${isSuccess ? `
    <div class="details-box">
      <div class="row">
        <span class="label">Request ID:</span>
        <span class="val">#${result.requestId}</span>
      </div>
      <div class="row">
        <span class="label">Requester:</span>
        <span class="val">${result.requesterName} (@${result.username})</span>
      </div>
      <div class="row">
        <span class="label">Action Applied:</span>
        <span class="val" style="color: ${themeColor};">${result.action.toUpperCase()}</span>
      </div>
      <div class="row">
        <span class="label">Time Verified:</span>
        <span class="val">${new Date(result.timestamp || Date.now()).toLocaleTimeString()}</span>
      </div>
      ${result.executionDetails ? `
      <div class="row">
        <span class="label">Stock Issued:</span>
        <span class="val">${result.executionDetails.quantity} pcs ➔ ${result.executionDetails.targetDept.toUpperCase()}</span>
      </div>
      ` : ''}
    </div>
    ` : ''}

    <a href="/" class="btn">Open ERP Dashboard</a>
    <p class="footer">🔒 Authenticated Remote Action • Garment Production ERP</p>
  </div>
</body>
</html>`;
};
