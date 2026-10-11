import { Database as BetterSqlite3Database } from 'better-sqlite3';

export interface EnrichedAuditLog {
  id: number;
  user_id: number;
  operator_name: string;
  username: string;
  user_role: string;
  user_department: string;
  department: string;
  action: string;
  human_action: string;
  table_name: string;
  record_id: string;
  po_number: string | null;
  buyer: string | null;
  style_num: string | null;
  color: string | null;
  size: string | null;
  line_number: string | null;
  quantity: number | null;
  cartons: number | null;
  pcs_per_carton: number | null;
  packing_type: string | null;
  summary_sentence: string;
  changes: Array<{
    field: string;
    label: string;
    old_value: any;
    new_value: any;
    diff?: string;
  }>;
  old_value: any;
  new_value: any;
  ip_address: string;
  created_at: string;
  is_undone: number;
  can_undo: boolean;
}

export function enrichAuditLogs(db: BetterSqlite3Database, rawLogs: any[]): EnrichedAuditLog[] {
  // Pre-fetch product & PO cache for high performance
  const productCache = new Map<number, any>();
  const poCache = new Map<string, any>();

  const getProduct = (productId: number | string | null | undefined) => {
    if (!productId) return null;
    const numId = typeof productId === 'string' ? parseInt(productId, 10) : productId;
    if (isNaN(numId) || numId <= 0) return null;
    if (productCache.has(numId)) return productCache.get(numId);

    try {
      const prod: any = db.prepare(`
        SELECT p.id, p.po_number, p.style_num, p.color, p.size, p.line_num, p.qty as target_qty, po.buyer
        FROM po_products p
        LEFT JOIN production_orders po ON p.po_number = po.po_number
        WHERE p.id = ?
      `).get(numId);
      if (prod) {
        productCache.set(numId, prod);
        return prod;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const getPO = (poNum: string | null | undefined) => {
    if (!poNum) return null;
    const cleanPo = String(poNum).trim();
    if (poCache.has(cleanPo)) return poCache.get(cleanPo);

    try {
      const po: any = db.prepare(`
        SELECT po_number, buyer, season, total_qty, status
        FROM production_orders
        WHERE po_number = ?
      `).get(cleanPo);
      if (po) {
        poCache.set(cleanPo, po);
        return po;
      }
    } catch {
      // ignore
    }
    return null;
  };

  return rawLogs.map((log) => {
    let parsedOld: any = null;
    let parsedNew: any = null;

    if (log.old_value) {
      try {
        parsedOld = JSON.parse(log.old_value);
      } catch {
        parsedOld = log.old_value;
      }
    }

    if (log.new_value) {
      try {
        parsedNew = JSON.parse(log.new_value);
      } catch {
        parsedNew = log.new_value;
      }
    }

    const table = (log.table_name || '').toLowerCase();
    const action = (log.action || '').toUpperCase();
    const recordIdStr = String(log.record_id || '');

    // 1. Department Mapping
    let department = 'System';
    if (table === 'cut_records') department = 'Cutting';
    else if (table === 'send_records') department = 'Feeding';
    else if (table === 'stitch_records') department = 'Stitching';
    else if (table === 'finish_records') department = 'Finishing';
    else if (table === 'pack_records') department = 'Packing';
    else if (table === 'press_records') department = 'Press / Ironing';
    else if (table === 'fabric_records') department = 'Fabric Store';
    else if (table === 'shipment_records') department = 'Shipping';
    else if (table === 'return_records') department = 'Returns';
    else if (table === 'discard_records') department = 'Discards';
    else if (table === 'production_orders' || table === 'po_products') department = 'PO / Orders';
    else if (table === 'cutting_programs') department = 'Cutting';
    else if (table === 'users') department = 'Users & Access';
    else if (table === 'permission_requests') department = 'Permissions & Time';
    else if (table === 'system_settings') department = 'System & Working Date';
    else if (table.includes('custom_form')) department = 'Custom Forms';

    // 2. Extract Garment Attributes
    let poNumber: string | null = null;
    let buyer: string | null = null;
    let styleNum: string | null = null;
    let color: string | null = null;
    let size: string | null = null;
    let lineNum: string | null = null;
    let quantity: number | null = null;
    let cartons: number | null = null;
    let pcsPerCarton: number | null = null;
    let packingType: string | null = null;

    // Check payload values
    const checkPayload = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.po_number && !poNumber) poNumber = String(obj.po_number);
      if (obj.buyer && !buyer) buyer = String(obj.buyer);
      if (obj.style_num && !styleNum) styleNum = String(obj.style_num);
      if (obj.color && !color) color = String(obj.color);
      if (obj.size && !size) size = String(obj.size);
      if ((obj.line_number || obj.line_num) && !lineNum) lineNum = String(obj.line_number || obj.line_num);
      if (obj.quantity !== undefined && quantity === null) quantity = Number(obj.quantity);
      if (obj.pcs_pressed !== undefined && quantity === null) quantity = Number(obj.pcs_pressed);
      if (obj.quantity_kg !== undefined && quantity === null) quantity = Number(obj.quantity_kg);
      if (obj.cartons !== undefined && cartons === null) cartons = Number(obj.cartons);
      if (obj.pcs_per_carton !== undefined && pcsPerCarton === null) pcsPerCarton = Number(obj.pcs_per_carton);
      if (obj.packing_type && !packingType) packingType = String(obj.packing_type);
    };

    checkPayload(parsedNew);
    checkPayload(parsedOld);

    // If product_id exists in payload or record_id
    let resolvedProd: any = null;
    const directProdId = parsedNew?.product_id || parsedOld?.product_id;
    if (directProdId) {
      resolvedProd = getProduct(directProdId);
    } else if (['cut_records', 'send_records', 'stitch_records', 'finish_records', 'pack_records', 'discard_records', 'return_records', 'shipment_records', 'po_products'].includes(table)) {
      if (recordIdStr.includes(',')) {
        // Multi-record action (like CONFIRM_HANDOVER or TRANSFER_TO_STORE)
        try {
          const sampleIds = recordIdStr.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n) && n > 0);
          if (sampleIds.length > 0 && table !== 'po_products') {
            const placeholders = sampleIds.slice(0, 5).map(() => '?').join(',');
            const rows: any[] = db.prepare(`SELECT DISTINCT po_number, product_id FROM ${table} WHERE id IN (${placeholders})`).all(...sampleIds.slice(0, 5));
            if (rows.length > 0) {
              if (rows[0].product_id) resolvedProd = getProduct(rows[0].product_id);
              if (rows[0].po_number && !poNumber) poNumber = rows[0].po_number;
            }
          }
        } catch {
          // ignore
        }
      } else {
        const parsedNum = parseInt(recordIdStr, 10);
        if (!isNaN(parsedNum) && parsedNum > 0) {
          if (table === 'po_products') {
            resolvedProd = getProduct(parsedNum);
          } else {
            // First check if record_id is a row in the table
            try {
              const row: any = db.prepare(`SELECT po_number, product_id FROM ${table} WHERE id = ?`).get(parsedNum);
              if (row && row.product_id) {
                resolvedProd = getProduct(row.product_id);
                if (row.po_number && !poNumber) poNumber = row.po_number;
              } else if (row && row.po_number && !poNumber) {
                poNumber = row.po_number;
              }
            } catch {
              // ignore
            }

            // If still not resolved, check if record_id itself was product_id
            if (!resolvedProd) {
              resolvedProd = getProduct(parsedNum);
            }
          }
        }
      }
    }

    if (resolvedProd) {
      if (!poNumber) poNumber = resolvedProd.po_number;
      if (!styleNum) styleNum = resolvedProd.style_num;
      if (!color) color = resolvedProd.color;
      if (!size) size = resolvedProd.size;
      if (!lineNum && resolvedProd.line_num) lineNum = resolvedProd.line_num;
      if (!buyer && resolvedProd.buyer) buyer = resolvedProd.buyer;
    }

    if (poNumber && !buyer) {
      const poData = getPO(poNumber);
      if (poData?.buyer) buyer = poData.buyer;
    }

    // 3. Human Action Title & Natural Language Description
    let humanAction = action;
    let summarySentence = '';
    const operatorName = log.full_name || log.username || 'System Operator';

    // Format human-friendly descriptions
    if (action === 'CREATE') {
      if (table === 'cut_records') {
        humanAction = 'Cutting Output Entered';
        summarySentence = `${operatorName} recorded ${quantity ? `${quantity.toLocaleString()} pcs` : 'output'} cut for PO ${poNumber || 'N/A'}${styleNum ? ` (Style: ${styleNum}, Color: ${color || '-'}, Size: ${size || '-'})` : ''}.`;
      } else if (table === 'send_records') {
        humanAction = 'Feeding Dispatch Entered';
        summarySentence = `${operatorName} dispatched ${quantity ? `${quantity.toLocaleString()} pcs` : 'pieces'} to Line ${lineNum || '-'} for PO ${poNumber || 'N/A'}${styleNum ? ` (Style: ${styleNum}, Color: ${color || '-'}, Size: ${size || '-'})` : ''}.`;
      } else if (table === 'stitch_records') {
        humanAction = 'Stitching Output Entered';
        summarySentence = `${operatorName} recorded ${quantity ? `${quantity.toLocaleString()} pcs` : 'pieces'} stitched${lineNum ? ` on Line ${lineNum}` : ''} for PO ${poNumber || 'N/A'}${styleNum ? ` (Style: ${styleNum}, Color: ${color || '-'}, Size: ${size || '-'})` : ''}.`;
      } else if (table === 'finish_records') {
        const resultType = parsedNew?.result === 'pass' ? 'Passed' : (parsedNew?.result === 'reject' ? 'Defect/Rejected' : 'Inspected');
        humanAction = `Finishing QC (${resultType})`;
        summarySentence = `${operatorName} recorded ${quantity ? `${quantity.toLocaleString()} pcs` : 'pieces'} [${resultType}] in Finishing for PO ${poNumber || 'N/A'}${styleNum ? ` (Style: ${styleNum}, Color: ${color || '-'}, Size: ${size || '-'})` : ''}.`;
      } else if (table === 'pack_records') {
        const packTypeLabel = packingType ? (packingType === 'carton' ? `Carton Packing (${cartons || '-'} ctns @ ${pcsPerCarton || '-'} pcs)` : `${packingType.toUpperCase()} Packing`) : 'Packing';
        humanAction = `Packing Output (${packTypeLabel})`;
        summarySentence = `${operatorName} registered ${quantity ? `${quantity.toLocaleString()} pcs` : 'pieces'} in ${packTypeLabel} for PO ${poNumber || 'N/A'}${styleNum ? ` (Style: ${styleNum}, Color: ${color || '-'}, Size: ${size || '-'})` : ''}.`;
      } else if (table === 'press_records') {
        humanAction = 'Ironing / Press Output Entered';
        summarySentence = `${operatorName} logged ${quantity ? `${quantity.toLocaleString()} pieces` : 'pieces'} ironed/pressed.`;
      } else if (table === 'fabric_records') {
        const recType = parsedNew?.record_type || 'Fabric Entry';
        humanAction = `Fabric ${recType.toUpperCase()}`;
        summarySentence = `${operatorName} logged ${quantity ? `${quantity} kg` : ''} of ${color || ''} fabric (${recType}) for PO ${poNumber || 'N/A'}.`;
      } else if (table === 'return_records') {
        humanAction = 'Defect Return Initiated';
        summarySentence = `${operatorName} initiated return of ${quantity ? `${quantity.toLocaleString()} pcs` : ''} from ${parsedNew?.from_department || 'dept'} to ${parsedNew?.to_department || 'dept'} for PO ${poNumber || 'N/A'}${parsedNew?.reason ? ` (Reason: ${parsedNew.reason})` : ''}.`;
      } else if (table === 'discard_records') {
        humanAction = 'Scrap / Discard Recorded';
        summarySentence = `${operatorName} discarded ${quantity ? `${quantity.toLocaleString()} pcs` : ''} from ${parsedNew?.department || 'department'} for PO ${poNumber || 'N/A'}${parsedNew?.reason ? ` (Reason: ${parsedNew.reason})` : ''}.`;
      } else if (table === 'production_orders') {
        humanAction = 'New Production Order Created';
        summarySentence = `${operatorName} created new PO #${poNumber || recordIdStr}${buyer ? ` for Buyer: ${buyer}` : ''}.`;
      } else {
        humanAction = 'Record Created';
        summarySentence = `${operatorName} added a new entry into ${department}.`;
      }
    } else if (action === 'CONFIRM_HANDOVER') {
      const count = recordIdStr.split(',').filter(Boolean).length;
      humanAction = 'Department Handover Accepted';
      summarySentence = `${operatorName} accepted and confirmed handover of ${count} lot(s)/bundle(s) in ${department}.`;
    } else if (action === 'TRANSFER_TO_STORE') {
      const count = recordIdStr.split(',').filter(Boolean).length;
      humanAction = 'Dispatched to Finished Store';
      summarySentence = `${operatorName} dispatched ${count} verified packed carton lot(s) in-transit to Warehouse Store.`;
    } else if (action === 'UPDATE') {
      humanAction = 'Record Modified / Corrected';
      let changeText = '';
      if (parsedOld && parsedNew) {
        if (parsedOld.quantity !== undefined && parsedNew.quantity !== undefined && parsedOld.quantity !== parsedNew.quantity) {
          const diff = parsedNew.quantity - parsedOld.quantity;
          changeText = `quantity from ${parsedOld.quantity} ➔ ${parsedNew.quantity} (${diff > 0 ? `+${diff}` : diff})`;
        }
      }
      summarySentence = `${operatorName} updated ${changeText || 'record values'} in ${department}${poNumber ? ` for PO ${poNumber}` : ''}${styleNum ? ` (${styleNum}, ${color || '-'}, ${size || '-'})` : ''}.`;
    } else if (action === 'DELETE') {
      humanAction = 'Record Deleted';
      summarySentence = `${operatorName} deleted record #${recordIdStr} from ${department}${poNumber ? ` (PO: ${poNumber}, Style: ${styleNum || '-'})` : ''}.`;
    } else if (action === 'DIRECT_TIME_CHANGE' || action === 'SET_WORKING_DATE') {
      humanAction = 'Working Date / Time Adjusted';
      summarySentence = `${operatorName} changed system working epoch to ${parsedNew ? (typeof parsedNew === 'string' ? parsedNew : JSON.stringify(parsedNew)) : recordIdStr}.`;
    } else if (action === 'REVERT_TO_REALTIME') {
      humanAction = 'Reverted to Live Realtime Clock';
      summarySentence = `${operatorName} switched system clock back to Live Realtime (was set to ${parsedOld ? (typeof parsedOld === 'string' ? parsedOld : JSON.stringify(parsedOld)) : 'custom date'}).`;
    } else if (action === 'CREATE_PERMISSION_REQUEST') {
      humanAction = 'Access / Time Request Submitted';
      const reqType = parsedNew?.request_type === 'datetime_change' ? 'Datetime Change' : (parsedNew?.request_type === 'dept_access' ? 'Department Access' : 'Page Access');
      summarySentence = `${operatorName} requested ${reqType}${parsedNew?.reason ? ` (Reason: "${parsedNew.reason}")` : ''}.`;
    } else if (action.startsWith('REVIEW_PERMISSION_REQUEST_')) {
      const isApproved = action.includes('APPROVED');
      humanAction = isApproved ? 'Permission Request Approved' : 'Permission Request Rejected';
      summarySentence = `${operatorName} ${isApproved ? 'approved' : 'rejected'} permission request #${recordIdStr}${parsedNew?.admin_notes ? ` (Note: "${parsedNew.admin_notes}")` : ''}.`;
    } else if (action === 'CREATE_USER') {
      humanAction = 'User Account Created';
      summarySentence = `${operatorName} created new system user @${parsedNew?.username || recordIdStr} (${parsedNew?.full_name || ''}, Role: ${parsedNew?.role || 'Operator'}).`;
    } else if (action === 'UPDATE_USER') {
      humanAction = 'User Account Updated';
      summarySentence = `${operatorName} updated credentials/permissions for user @${parsedNew?.username || recordIdStr}.`;
    } else if (action === 'DELETE_USER') {
      humanAction = 'User Account Removed';
      summarySentence = `${operatorName} deleted/deactivated user account #${recordIdStr}.`;
    } else if (action === 'UNDO_ACTION') {
      humanAction = 'Audit Log Reversal Executed';
      summarySentence = `${operatorName} reversed / rolled back previous audit action #${recordIdStr}.`;
    } else if (action === 'CLOSE_PO_ARCHIVE') {
      humanAction = 'PO Closed / Archived';
      summarySentence = `${operatorName} archived Production Order ${recordIdStr}.`;
    } else if (action === 'REOPEN_PO_ACTIVATE') {
      humanAction = 'PO Reopened / Activated';
      summarySentence = `${operatorName} reopened Production Order ${recordIdStr} to active status.`;
    } else {
      summarySentence = `${operatorName} performed ${action} in ${department}.`;
    }

    // 4. Compute Structured Field Changes (Diffs)
    const changes: EnrichedAuditLog['changes'] = [];
    if (parsedOld && parsedNew && typeof parsedOld === 'object' && typeof parsedNew === 'object') {
      const allKeys = Array.from(new Set([...Object.keys(parsedOld), ...Object.keys(parsedNew)]));
      for (const k of allKeys) {
        if (['id', 'created_at', 'created_by', 'received_at', 'received_by'].includes(k)) continue;
        const oldV = parsedOld[k];
        const newV = parsedNew[k];
        if (oldV !== newV) {
          let diffStr: string | undefined = undefined;
          if (typeof oldV === 'number' && typeof newV === 'number') {
            const diffNum = newV - oldV;
            diffStr = diffNum > 0 ? `+${diffNum}` : `${diffNum}`;
          }
          const label = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          changes.push({
            field: k,
            label,
            old_value: oldV !== undefined ? oldV : null,
            new_value: newV !== undefined ? newV : null,
            diff: diffStr
          });
        }
      }
    } else if (parsedOld && !parsedNew) {
      if (typeof parsedOld === 'object') {
        for (const [k, v] of Object.entries(parsedOld)) {
          if (['id', 'created_at'].includes(k)) continue;
          changes.push({
            field: k,
            label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            old_value: v,
            new_value: null
          });
        }
      } else {
        changes.push({
          field: 'value',
          label: 'Previous Value',
          old_value: parsedOld,
          new_value: null
        });
      }
    } else if (!parsedOld && parsedNew) {
      if (typeof parsedNew === 'object') {
        for (const [k, v] of Object.entries(parsedNew)) {
          if (['id', 'created_at'].includes(k)) continue;
          changes.push({
            field: k,
            label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            old_value: null,
            new_value: v
          });
        }
      } else {
        changes.push({
          field: 'value',
          label: 'New Value',
          old_value: null,
          new_value: parsedNew
        });
      }
    }

    // 5. Determine if reversible
    const reversibleActions = [
      'CREATE', 'UPDATE', 'DELETE',
      'CONFIRM_HANDOVER', 'TRANSFER_TO_STORE',
      'CLOSE_PO_ARCHIVE', 'REOPEN_PO_ACTIVATE', 'UPDATE_STATUS',
      'DIRECT_TIME_CHANGE', 'SET_WORKING_DATE', 'REVERT_TO_REALTIME'
    ];
    const canUndo = log.is_undone !== 1 && action !== 'UNDO_ACTION' && reversibleActions.includes(action);

    // Normalize created_at to ISO UTC string
    let normalizedCreatedAt = log.created_at || '';
    if (normalizedCreatedAt) {
      if (!normalizedCreatedAt.includes('T') && !normalizedCreatedAt.includes('Z')) {
        normalizedCreatedAt = normalizedCreatedAt.replace(' ', 'T') + 'Z';
      } else if (normalizedCreatedAt.includes('T') && !normalizedCreatedAt.endsWith('Z') && !normalizedCreatedAt.includes('+') && !normalizedCreatedAt.includes('-')) {
        normalizedCreatedAt = normalizedCreatedAt + 'Z';
      }
    } else {
      normalizedCreatedAt = new Date().toISOString();
    }

    return {
      id: log.id,
      user_id: log.user_id,
      operator_name: log.full_name || log.username || 'System User',
      username: log.username || 'system',
      user_role: log.user_role || 'operator',
      user_department: log.user_department || 'Production',
      department,
      action: log.action,
      human_action: humanAction,
      table_name: log.table_name,
      record_id: String(log.record_id),
      po_number: poNumber,
      buyer,
      style_num: styleNum,
      color,
      size,
      line_number: lineNum,
      quantity,
      cartons,
      pcs_per_carton: pcsPerCarton,
      packing_type: packingType,
      summary_sentence: summarySentence,
      changes,
      old_value: parsedOld,
      new_value: parsedNew,
      ip_address: log.ip_address || '',
      created_at: normalizedCreatedAt,
      is_undone: log.is_undone || 0,
      can_undo: canUndo
    };
  });
}
