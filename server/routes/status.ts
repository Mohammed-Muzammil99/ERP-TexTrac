import { Router } from 'express';
import { db, determineBuyerFromStyle, logAudit, normalizeToFullForm, getUnifiedColor, getRecordTimestamp } from '../db';
import { authenticateToken, isAdmin } from '../middleware';

const router = Router();

// Subqueries representing the union of active and archived records for seamless analytics
const cutUnion = `(SELECT * FROM cut_records UNION ALL SELECT * FROM archive_cut_records)`;
const sendUnion = `(SELECT * FROM send_records UNION ALL SELECT * FROM archive_send_records)`;
const stitchUnion = `(SELECT * FROM stitch_records UNION ALL SELECT * FROM archive_stitch_records)`;
const finishUnion = `(SELECT * FROM finish_records UNION ALL SELECT * FROM archive_finish_records)`;
const packUnion = `(SELECT * FROM pack_records UNION ALL SELECT * FROM archive_pack_records)`;
const returnUnion = `(SELECT * FROM return_records UNION ALL SELECT * FROM archive_return_records)`;

// --- Status Summary ---
router.get('/status/summary', authenticateToken, (req, res) => {
  const date = req.query.date as string;
  const hour = req.query.hour as string;

  let parsedHour: string | null = null;
  if (hour) {
    const match = hour.match(/^(\d+)/);
    if (match) {
      parsedHour = String(parseInt(match[1]));
    }
  }

  const getFilterClause = (hasExistingWhere: boolean, dateVal?: string, hourVal?: string | null) => {
    const clauses: string[] = [];
    const params: any[] = [];
    if (dateVal) {
      clauses.push("date(created_at) = date(?)");
      params.push(dateVal);
    }
    if (hourVal !== null && hourVal !== undefined) {
      clauses.push("CAST(strftime('%H', created_at) AS INTEGER) = CAST(? AS INTEGER)");
      params.push(hourVal);
    }
    if (clauses.length === 0) return { sql: "", params: [] };
    return {
      sql: (hasExistingWhere ? " AND " : " WHERE ") + clauses.join(" AND "),
      params
    };
  };

  const poFilter = getFilterClause(false, date, parsedHour);
  const returnsFilter = getFilterClause(true, date, parsedHour);
  const cutFilter = getFilterClause(true, date, parsedHour);
  const sendFilter = getFilterClause(true, date, parsedHour);
  const stitchFilter = getFilterClause(true, date, parsedHour);
  const finishPassFilter = getFilterClause(true, date, parsedHour);
  const finishRejectFilter = getFilterClause(true, date, parsedHour);
  const packCartonFilter = getFilterClause(true, date, parsedHour);
  const packBlisterFilter = getFilterClause(true, date, parsedHour);
  const shipFilter = getFilterClause(false, date, parsedHour);
  const retTotalFilter = getFilterClause(true, date, parsedHour);
  const pressFilter = getFilterClause(false, date, parsedHour);

  const returnedByDept = db.prepare(`
    SELECT from_department, SUM(quantity) as total 
    FROM ${returnUnion} 
    WHERE status != 'rejected' ${returnsFilter.sql}
    GROUP BY from_department
  `).all(...returnsFilter.params) as any[];

  const returnsMap: Record<string, number> = {};
  returnedByDept.forEach(r => {
    returnsMap[r.from_department] = r.total || 0;
  });

  const summary: any = {
    total_orders: db.prepare(`SELECT COUNT(*) as total FROM production_orders ${poFilter.sql}`).get(...poFilter.params) as any,
    total_po_qty: db.prepare(`SELECT SUM(total_qty) as total FROM production_orders ${poFilter.sql}`).get(...poFilter.params) as any,
    total_cut_raw: db.prepare(`SELECT SUM(quantity) as total FROM ${cutUnion} WHERE status = 'accepted' ${cutFilter.sql}`).get(...cutFilter.params) as any,
    total_sent_raw: db.prepare(`SELECT SUM(quantity) as total FROM ${sendUnion} WHERE status = 'accepted' ${sendFilter.sql}`).get(...sendFilter.params) as any,
    total_stitched_raw: db.prepare(`SELECT SUM(quantity) as total FROM ${stitchUnion} WHERE status = 'accepted' ${stitchFilter.sql}`).get(...stitchFilter.params) as any,
    total_passed_raw: db.prepare(`SELECT SUM(quantity) as total FROM ${finishUnion} WHERE result = 'pass' AND status = 'accepted' ${finishPassFilter.sql}`).get(...finishPassFilter.params) as any,
    total_rejected: db.prepare(`SELECT SUM(quantity) as total FROM ${finishUnion} WHERE result = 'reject' AND status != 'rejected' ${finishRejectFilter.sql}`).get(...finishRejectFilter.params) as any,
    total_cartoned: db.prepare(`SELECT SUM(quantity) as total FROM ${packUnion} WHERE packing_type = 'carton' AND status = 'accepted' ${packCartonFilter.sql}`).get(...packCartonFilter.params) as any,
    total_blistered: db.prepare(`SELECT SUM(quantity) as total FROM ${packUnion} WHERE packing_type = 'blister' AND status = 'accepted' ${packBlisterFilter.sql}`).get(...packBlisterFilter.params) as any,
    total_shipped: db.prepare(`SELECT SUM(quantity) as total FROM shipment_records ${shipFilter.sql}`).get(...shipFilter.params) as any,
    total_returns: db.prepare(`SELECT SUM(quantity) as total FROM ${returnUnion} WHERE status != 'rejected' ${retTotalFilter.sql}`).get(...retTotalFilter.params) as any,
    total_pressed_raw: db.prepare(`SELECT SUM(pcs_pressed) as total FROM press_records ${pressFilter.sql}`).get(...pressFilter.params) as any,
  };

  const total_cut = Math.max(0, (summary.total_cut_raw?.total || 0) - (returnsMap['Feeding'] || 0));
  const total_sent = Math.max(0, (summary.total_sent_raw?.total || 0) - (returnsMap['Stitching'] || 0));
  const total_stitched = Math.max(0, (summary.total_stitched_raw?.total || 0) - (returnsMap['Finishing'] || 0));
  const total_passed = Math.max(0, (summary.total_passed_raw?.total || 0) - (returnsMap['Packing'] || 0));

  let wipSql = `
    SELECT p.id, p.qty, 
           COALESCE(s.total_shipped, (SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as total_shipped
    FROM po_products p
    JOIN production_orders po ON p.po_number = po.po_number
    LEFT JOIN archived_po_summaries s ON p.id = s.product_id
    WHERE LOWER(po.status) = 'active'
  `;

  let wipParams: any[] = [];
  if (date && parsedHour) {
    wipSql += " AND date(po.created_at) = date(?) AND CAST(strftime('%H', po.created_at) AS INTEGER) = CAST(? AS INTEGER)";
    wipParams = [date, parsedHour];
  } else if (date) {
    wipSql += " AND date(po.created_at) = date(?)";
    wipParams = [date];
  } else if (parsedHour) {
    wipSql += " AND CAST(strftime('%H', po.created_at) AS INTEGER) = CAST(? AS INTEGER)";
    wipParams = [parsedHour];
  }

  const activeProducts = db.prepare(wipSql).all(...wipParams) as any[];

  let total_wip = 0;
  activeProducts.forEach(p => {
    const wip = Math.max(0, (p.qty || 0) - (p.total_shipped || 0));
    total_wip += wip;
  });

  res.json({
    total_orders: summary.total_orders?.total || 0,
    total_po_qty: summary.total_po_qty?.total || 0,
    total_cut,
    total_sent,
    total_stitched,
    total_passed,
    total_rejected: summary.total_rejected?.total || 0,
    total_packed: summary.total_cartoned?.total || 0,
    total_blistered: summary.total_blistered?.total || 0,
    total_shipped: summary.total_shipped?.total || 0,
    total_returns: summary.total_returns?.total || 0,
    total_pressed: summary.total_pressed_raw?.total || 0,
    total_wip,
  });
});

// --- Status per production order with buyer groupings ---
router.get('/status/pos', authenticateToken, (req, res) => {
  const date = req.query.date as string;
  
  const pos = db.prepare(`SELECT * FROM production_orders ORDER BY delivery_date ASC`).all() as any[];
  const products = db.prepare(`SELECT * FROM po_products`).all() as any[];
  const params = date ? [date] : [];

  const cutRecords = db.prepare(`SELECT product_id, quantity, status FROM ${cutUnion} WHERE 1=1 ${date ? " AND date(created_at) = date(?)" : ""}`).all(...params) as any[];
  const sendRecords = db.prepare(`SELECT product_id, quantity, status FROM ${sendUnion} WHERE 1=1 ${date ? " AND date(created_at) = date(?)" : ""}`).all(...params) as any[];
  const stitchRecords = db.prepare(`SELECT product_id, quantity, status FROM ${stitchUnion} WHERE 1=1 ${date ? " AND date(created_at) = date(?)" : ""}`).all(...params) as any[];
  const finishRecords = db.prepare(`SELECT product_id, quantity, status, result FROM ${finishUnion} WHERE 1=1 ${date ? " AND date(created_at) = date(?)" : ""}`).all(...params) as any[];
  const packRecords = db.prepare(`SELECT product_id, quantity, status, packing_type FROM ${packUnion} WHERE 1=1 ${date ? " AND date(created_at) = date(?)" : ""}`).all(...params) as any[];
  const shipmentRecords = db.prepare(`SELECT product_id, quantity FROM shipment_records WHERE 1=1 ${date ? " AND date(created_at) = date(?)" : ""}`).all(...params) as any[];
  const returnRecords = db.prepare(`SELECT product_id, quantity, status, from_department FROM ${returnUnion} WHERE status != 'rejected' ${date ? " AND date(created_at) = date(?)" : ""}`).all(...params) as any[];

  const result: any[] = [];

  pos.forEach((po) => {
    const poProducts = products.filter(p => p.po_number === po.po_number);
    if (poProducts.length === 0) {
      result.push({
        po_number: po.po_number,
        buyer: po.buyer || 'badger',
        delivery_date: po.delivery_date,
        total_po_qty: 0,
        total_qty: 0,
        any_cut: 0,
        any_sent: 0,
        any_stitched: 0,
        any_passed: 0,
        any_packed: 0,
        total_cut: 0,
        total_sent: 0,
        total_stitched: 0,
        total_passed: 0,
        total_blistered: 0,
        total_packed: 0,
        total_shipped: 0
      });
      return;
    }

    // Group products by buyer
    const explicitPOBuyer = po.buyer && po.buyer.trim() && po.buyer.trim().toUpperCase() !== 'UNIVERSAL' && po.buyer.trim().toUpperCase() !== 'GLOBAL' ? po.buyer.trim() : null;
    const groups: Record<string, any[]> = {};
    poProducts.forEach(p => {
      const b = explicitPOBuyer || p.buyer || determineBuyerFromStyle(p.style_num) || 'badger';
      if (!groups[b]) groups[b] = [];
      groups[b].push(p);
    });

    Object.entries(groups).forEach(([buyer, prods]) => {
      const prodIds = prods.map(p => p.id);
      const prodIdsSet = new Set(prodIds);

      const total_po_qty = prods.reduce((sum, p) => sum + (p.qty || 0), 0);

      const groupCuts = cutRecords.filter(r => prodIdsSet.has(r.product_id));
      const groupSends = sendRecords.filter(r => prodIdsSet.has(r.product_id));
      const groupStitchers = stitchRecords.filter(r => prodIdsSet.has(r.product_id));
      const groupFinishes = finishRecords.filter(r => prodIdsSet.has(r.product_id));
      const groupPacks = packRecords.filter(r => prodIdsSet.has(r.product_id));
      const groupShipments = shipmentRecords.filter(r => prodIdsSet.has(r.product_id));
      const groupReturns = returnRecords.filter(r => prodIdsSet.has(r.product_id));

      const returned_feeding = groupReturns.filter(r => r.from_department === 'Feeding').reduce((sum, r) => sum + (r.quantity || 0), 0);
      const returned_stitching = groupReturns.filter(r => r.from_department === 'Stitching').reduce((sum, r) => sum + (r.quantity || 0), 0);
      const returned_finishing = groupReturns.filter(r => r.from_department === 'Finishing').reduce((sum, r) => sum + (r.quantity || 0), 0);
      const returned_packing = groupReturns.filter(r => r.from_department === 'Packing').reduce((sum, r) => sum + (r.quantity || 0), 0);

      const any_cut = Math.max(0, groupCuts.reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_feeding);
      const any_sent = Math.max(0, groupSends.reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_stitching);
      const any_stitched = Math.max(0, groupStitchers.reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_finishing);
      const any_passed = Math.max(0, groupFinishes.reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_packing);
      const any_packed = groupPacks.reduce((sum, r) => sum + (r.quantity || 0), 0);

      const total_cut = Math.max(0, groupCuts.filter(r => r.status === 'accepted').reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_feeding);
      const total_sent = Math.max(0, groupSends.filter(r => r.status === 'accepted').reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_stitching);
      const total_stitched = Math.max(0, groupStitchers.filter(r => r.status === 'accepted').reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_finishing);
      const total_passed = Math.max(0, groupFinishes.filter(r => r.status === 'accepted' && r.result === 'pass').reduce((sum, r) => sum + (r.quantity || 0), 0) - returned_packing);
      const total_blistered = groupPacks.filter(r => r.status === 'accepted' && r.packing_type === 'blister').reduce((sum, r) => sum + (r.quantity || 0), 0);
      const total_packed = groupPacks.filter(r => r.status === 'accepted' && r.packing_type === 'carton').reduce((sum, r) => sum + (r.quantity || 0), 0);
      const total_shipped = groupShipments.reduce((sum, r) => sum + (r.quantity || 0), 0);

      result.push({
        po_number: po.po_number,
        buyer,
        delivery_date: po.delivery_date,
        total_po_qty,
        total_qty: total_po_qty,
        any_cut,
        any_sent,
        any_stitched,
        any_passed,
        any_packed,
        total_cut,
        total_sent,
        total_stitched,
        total_passed,
        total_blistered,
        total_packed,
        total_shipped
      });
    });
  });

  res.json(result);
});

// --- Detailed tracking per size, color, style ---
router.get('/status/detailed', authenticateToken, (req, res) => {
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const date = req.query.date as string;
  
  const dateFilter = (startDate && endDate) 
    ? "AND date(created_at) BETWEEN date(?) AND date(?)" 
    : (date ? "AND date(created_at) = date(?)" : "");
  
  const queryStr = `
    SELECT 
      p.id as product_id,
      p.est_date as est_date,
      p.po_number,
      p.style_num,
      p.color,
      p.size,
      max(0, p.qty - COALESCE(s.total_shipped, (SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0)) as order_qty,
      po.status as po_status,
      po.buyer as buyer,
      COALESCE(p.delivery_date, po.delivery_date) as delivery_date,
      COALESCE(s.total_cut, COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = p.id AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Feeding' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Cutting'), 0), 0) as total_cut,
      COALESCE(s.total_cut, COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Feeding' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Cutting'), 0), 0) as cut_accepted,
      COALESCE(s.total_sent, COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Sending'), 0), 0) as total_sent,
      COALESCE(s.total_sent, COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Sending'), 0), 0) as send_accepted,
      COALESCE(s.total_stitched, COALESCE((SELECT SUM(quantity) FROM stitch_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Stitching'), 0), 0) as total_stitched,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('1', 'line 1', 'line1') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('1', 'line 1', 'line1') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Sending'), 0)) END as line_1_send_accepted,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('1', 'line 1', 'line1') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM stitch_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('1', 'line 1', 'line1') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Stitching'), 0)) END as line_1_total_stitched,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('2', 'line 2', 'line2') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('2', 'line 2', 'line2') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Sending'), 0)) END as line_2_send_accepted,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('2', 'line 2', 'line2') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM stitch_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('2', 'line 2', 'line2') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Stitching'), 0)) END as line_2_total_stitched,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('3', 'line 3', 'line3') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('3', 'line 3', 'line3') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Sending'), 0)) END as line_3_send_accepted,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('3', 'line 3', 'line3') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM stitch_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('3', 'line 3', 'line3') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Stitching'), 0)) END as line_3_total_stitched,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('4', 'line 4', 'line4') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('4', 'line 4', 'line4') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Sending'), 0)) END as line_4_send_accepted,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('4', 'line 4', 'line4') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM stitch_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('4', 'line 4', 'line4') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Stitching'), 0)) END as line_4_total_stitched,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('5', 'line 5', 'line5') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('5', 'line 5', 'line5') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Stitching' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Sending'), 0)) END as line_5_send_accepted,
      CASE WHEN COALESCE((SELECT SUM(quantity) FROM send_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('5', 'line 5', 'line5') ${dateFilter}), 0) = 0 THEN 0 ELSE MAX(0, COALESCE((SELECT SUM(quantity) FROM stitch_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 AND LOWER(TRIM(line_number)) IN ('5', 'line 5', 'line5') ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Stitching'), 0)) END as line_5_total_stitched,
      COALESCE(s.total_stitched, COALESCE((SELECT SUM(quantity) FROM stitch_records WHERE product_id = p.id AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Stitching'), 0), 0) as stitch_accepted,
      COALESCE(s.total_finished_passed, COALESCE((SELECT SUM(quantity) FROM finish_records WHERE product_id = p.id AND result = 'pass' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Packing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Finishing'), 0), 0) as total_passed,
      COALESCE(s.total_finished_passed, COALESCE((SELECT SUM(quantity) FROM finish_records WHERE product_id = p.id AND result = 'pass' AND status = 'accepted' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Packing' ${dateFilter}), 0) - COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Finishing'), 0), 0) as pass_accepted,
      COALESCE(s.total_finished_rejected, (SELECT SUM(quantity) FROM finish_records WHERE product_id = p.id AND result = 'reject' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) as total_rejected,
      COALESCE(s.total_packed_blister, (SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'blister' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) as total_blistered,
      COALESCE(s.total_packed_carton, (SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0 ${dateFilter}), 0) as total_packed,
      COALESCE(s.total_finished_passed - s.total_returns - s.total_packed_blister, 
        COALESCE((SELECT SUM(quantity) FROM finish_records WHERE product_id = p.id AND result = 'pass' AND status = 'accepted'), 0) -
        COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Packing'), 0) -
        COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Finishing'), 0) -
        COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'blister' AND status != 'rejected'), 0) -
        COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 1 AND status != 'rejected'), 0) -
        COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Packing - Loose'), 0)
      ) as loose_available,
      COALESCE(s.total_packed_blister - s.total_packed_carton, 
        COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'blister' AND status = 'accepted'), 0) -
        COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 0 AND status != 'rejected'), 0) -
        COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Packing - Blister'), 0)
      ) as blister_available,
      COALESCE(s.total_packed_carton, (SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted'), 0) as carton_pcs,
      COALESCE(s.total_packed_carton_count, (SELECT SUM(cartons) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted'), 0) as carton_count,
      COALESCE(s.total_packed_carton, (SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted'), 0) -
      COALESCE(s.total_shipped, (SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as store_available_pcs,
      COALESCE(s.total_packed_carton_count, (SELECT SUM(cartons) FROM pack_records WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted'), 0) -
      COALESCE((SELECT SUM(cartons) FROM shipment_records WHERE product_id = p.id), 0) as store_available_cartons,
      COALESCE((SELECT SUM(quantity) FROM pack_records WHERE product_id = p.id AND status = 'rejected' ${dateFilter}), 0) as pack_rejected,
      COALESCE(s.total_shipped, (SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id ${dateFilter}), 0) as total_shipped
    FROM po_products p
    JOIN production_orders po ON p.po_number = po.po_number
    LEFT JOIN archived_po_summaries s ON p.id = s.product_id
    ORDER BY p.po_number DESC, p.style_num ASC
  `;
  
  const placeholderCount = (queryStr.match(/\?/g) || []).length;
  const params: string[] = [];
  if (startDate && endDate) {
    for (let i = 0; i < placeholderCount; i++) {
      params.push(i % 2 === 0 ? startDate : endDate);
    }
  } else if (date) {
    params.push(...Array(placeholderCount).fill(date));
  }
  
  const data = db.prepare(queryStr).all(...params) as any[];
  const processedData = data.map(r => {
    const explicitBuyer = (r.buyer && String(r.buyer).trim() && String(r.buyer).trim().toUpperCase() !== 'UNIVERSAL' && String(r.buyer).trim().toUpperCase() !== 'GLOBAL')
      ? String(r.buyer).trim()
      : null;
    return {
      ...r,
      buyer: explicitBuyer || determineBuyerFromStyle(r.style_num) || 'badger'
    };
  });
  res.json(processedData);
});

// --- Stitching lines summary ---
router.get('/status/stitching-lines', authenticateToken, (req, res) => {
  const date = req.query.date as string;
  const dateFilter = date ? "AND date(created_at) = date(?)" : "";
  
  const data = db.prepare(`
    SELECT 
      line_number, 
      SUM(quantity) as total_stitched,
      COUNT(DISTINCT po_number) as po_count
    FROM ${stitchUnion}
    WHERE status != 'rejected'
      AND LOWER(TRIM(line_number)) IN ('1', '2', '3', '4', '5', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5')
      ${dateFilter}
    GROUP BY line_number
    ORDER BY line_number ASC
  `).all(date ? [date] : []);
  res.json(data);
});

// --- Stitching lines dashboard analytics ---
router.get('/status/stitching-lines-dashboard', authenticateToken, (req, res) => {
  try {
    let targetDate = req.query.date as string;
    if (!targetDate || targetDate === 'null' || targetDate === 'undefined') {
      targetDate = getRecordTimestamp(req).split(' ')[0];
    }

    // Fetch line configurations for target date
    const configsInDb = db.prepare(`
      SELECT line_number, seated_operators, target_hourly_benchmark 
      FROM stitching_line_configs 
      WHERE date = date(?)
    `).all(targetDate) as any[];

    // 1. Get daily performance comparison across 5 lines (rolling 10 days)
    const dailyData = db.prepare(`
      SELECT 
        date(created_at) as day,
        CASE 
          WHEN LOWER(TRIM(line_number)) IN ('1', 'line 1') THEN 'Line 1'
          WHEN LOWER(TRIM(line_number)) IN ('2', 'line 2') THEN 'Line 2'
          WHEN LOWER(TRIM(line_number)) IN ('3', 'line 3') THEN 'Line 3'
          WHEN LOWER(TRIM(line_number)) IN ('4', 'line 4') THEN 'Line 4'
          WHEN LOWER(TRIM(line_number)) IN ('5', 'line 5') THEN 'Line 5'
          ELSE 'Line 1'
        END AS physical_line,
        SUM(quantity) as total_stitched
      FROM ${stitchUnion}
      WHERE status = 'accepted'
        AND LOWER(TRIM(line_number)) IN ('1', '2', '3', '4', '5', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5')
      GROUP BY day, physical_line
      ORDER BY day DESC
    `).all() as any[];

    // 2. Get hourly performance today (8:00 to 20:00)
    const hourlyData = db.prepare(`
      SELECT 
        strftime('%H:00', created_at) as hr,
        CASE 
          WHEN LOWER(TRIM(line_number)) IN ('1', 'line 1') THEN 'Line 1'
          WHEN LOWER(TRIM(line_number)) IN ('2', 'line 2') THEN 'Line 2'
          WHEN LOWER(TRIM(line_number)) IN ('3', 'line 3') THEN 'Line 3'
          WHEN LOWER(TRIM(line_number)) IN ('4', 'line 4') THEN 'Line 4'
          WHEN LOWER(TRIM(line_number)) IN ('5', 'line 5') THEN 'Line 5'
          ELSE 'Line 1'
        END AS physical_line,
        SUM(quantity) as total_stitched
      FROM ${stitchUnion}
      WHERE status = 'accepted' AND date(created_at) = date(?)
        AND LOWER(TRIM(line_number)) IN ('1', '2', '3', '4', '5', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5')
      GROUP BY hr, physical_line
    `).all(targetDate) as any[];

    // 3. Get today's line summary information
    const summaryData = db.prepare(`
      SELECT 
        CASE 
          WHEN LOWER(TRIM(s.line_number)) IN ('1', 'line 1') THEN 'Line 1'
          WHEN LOWER(TRIM(s.line_number)) IN ('2', 'line 2') THEN 'Line 2'
          WHEN LOWER(TRIM(s.line_number)) IN ('3', 'line 3') THEN 'Line 3'
          WHEN LOWER(TRIM(s.line_number)) IN ('4', 'line 4') THEN 'Line 4'
          WHEN LOWER(TRIM(s.line_number)) IN ('5', 'line 5') THEN 'Line 5'
          ELSE 'Line 1'
        END AS physical_line,
        SUM(s.quantity) as total_stitched,
        COUNT(DISTINCT s.po_number) as po_count,
        COUNT(DISTINCT p.style_num) as style_count,
        GROUP_CONCAT(DISTINCT p.style_num) as styles_list
      FROM ${stitchUnion} s
      LEFT JOIN po_products p ON s.product_id = p.id
      WHERE s.status = 'accepted' AND date(s.created_at) = date(?)
        AND LOWER(TRIM(s.line_number)) IN ('1', '2', '3', '4', '5', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5')
      GROUP BY physical_line
    `).all(targetDate) as any[];

    // Standardize 5 lines
    const physicalLinesList = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];

    // Construct 10 rolling days list
    const daysSet = new Set<string>();
    dailyData.forEach(item => {
      if (item.day) daysSet.add(item.day);
    });
    daysSet.add(targetDate);
    const sortedDays = Array.from(daysSet).sort().slice(-10);

    const rollingDailyTrend = sortedDays.map(dayStr => {
      const row: any = { date: dayStr };
      physicalLinesList.forEach(lineName => {
        const match = dailyData.find(item => item.day === dayStr && item.physical_line === lineName);
        row[lineName] = match ? match.total_stitched : 0;
      });
      return row;
    });

    // Construct hourly intervals today
    const hoursList = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
    const hourlyTrendToday = hoursList.map(hrStr => {
      const row: any = { hour: hrStr };
      physicalLinesList.forEach(lineName => {
        const match = hourlyData.find(item => item.hr === hrStr && item.physical_line === lineName);
        row[lineName] = match ? match.total_stitched : 0;
      });
      return row;
    });

    // Construct line summary detail cards
    const lineSummaries = physicalLinesList.map(lineName => {
      const match = summaryData.find(item => item.physical_line === lineName);
      const total_stitched = match ? match.total_stitched : 0;
      const po_count = match ? match.po_count : 0;
      const style_count = match ? match.style_count : 0;
      const styles = match?.styles_list ? Array.from(new Set(match.styles_list.split(','))) : [];
      
      const config = configsInDb.find(c => c.line_number === lineName) || {
        seated_operators: 20,
        target_hourly_benchmark: 150
      };

      const target = config.target_hourly_benchmark * 8;
      const efficiency = total_stitched > 0 ? Math.round((total_stitched / target) * 100) : 0;

      let status = 'Idle';
      if (total_stitched >= target) status = 'Optimal';
      else if (total_stitched >= target / 2) status = 'Active';
      else if (total_stitched > 0) status = 'Low Output';

      return {
        line: lineName,
        total_stitched,
        po_count,
        style_count,
        styles,
        target,
        efficiency,
        status,
        seated_operators: config.seated_operators,
        target_hourly_benchmark: config.target_hourly_benchmark
      };
    });

    res.json({
      target_date: targetDate,
      daily_trend: rollingDailyTrend,
      hourly_trend: hourlyTrendToday,
      summaries: lineSummaries
    });

  } catch (error: any) {
    console.error('Failed to get stitching lines dashboard analytics:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// GET stitching line configs for a specific date
router.get('/status/stitching-line-configs', authenticateToken, (req, res) => {
  try {
    let targetDate = req.query.date as string;
    if (!targetDate || targetDate === 'null' || targetDate === 'undefined') {
      targetDate = getRecordTimestamp(req).split(' ')[0];
    }

    const configs = db.prepare(`
      SELECT line_number, seated_operators, target_hourly_benchmark 
      FROM stitching_line_configs 
      WHERE date = date(?)
    `).all(targetDate) as any[];

    // Ensure all physical lines, feeding lines, and departments are returned
    const physicalLinesList = [
      'Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5',
      'Feeding Line 1', 'Feeding Line 2', 'Feeding Line 3', 'Feeding Line 4', 'Feeding Line 5',
      'Cutting & Fabrication',
      'Trims Status',
      'Press',
      'Carton Packed',
      'Blister Packed'
    ];
    const result = physicalLinesList.map(lineName => {
      const found = configs.find(c => c.line_number === lineName);
      
      let defaultOperators = 0;
      let defaultTarget = 0;
      
      if (lineName === 'Line 1') { defaultOperators = 0; defaultTarget = 0; }
      else if (lineName === 'Line 2') { defaultOperators = 25; defaultTarget = 150; }
      else if (lineName === 'Line 3') { defaultOperators = 20; defaultTarget = 75; }
      else if (lineName === 'Line 4') { defaultOperators = 21; defaultTarget = 88; }
      else if (lineName === 'Line 5') { defaultOperators = 20; defaultTarget = 100; }
      else if (lineName === 'Feeding Line 1') { defaultOperators = 0; defaultTarget = 0; }
      else if (lineName === 'Feeding Line 2') { defaultOperators = 0; defaultTarget = 150; }
      else if (lineName === 'Feeding Line 3') { defaultOperators = 0; defaultTarget = 75; }
      else if (lineName === 'Feeding Line 4') { defaultOperators = 0; defaultTarget = 88; }
      else if (lineName === 'Feeding Line 5') { defaultOperators = 0; defaultTarget = 100; }
      else if (lineName === 'Cutting & Fabrication') { defaultOperators = 4; defaultTarget = 300; }
      else if (lineName === 'Trims Status') { defaultOperators = 4; defaultTarget = 300; }
      else if (lineName === 'Press') { defaultOperators = 2; defaultTarget = 313; }
      else if (lineName === 'Carton Packed') { defaultOperators = 19; defaultTarget = 313; }
      else if (lineName === 'Blister Packed') { defaultOperators = 10; defaultTarget = 200; }

      return {
        line_number: lineName,
        seated_operators: found ? found.seated_operators : defaultOperators,
        target_hourly_benchmark: found ? found.target_hourly_benchmark : defaultTarget
      };
    });

    res.json({ date: targetDate, configs: result });
  } catch (error: any) {
    console.error('Failed to get stitching line configs:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET hourly production report one-view
router.get('/status/hourly-report-oneview', authenticateToken, (req, res) => {
  try {
    let targetDate = req.query.date as string;
    if (!targetDate || targetDate === 'null' || targetDate === 'undefined') {
      targetDate = getRecordTimestamp(req).split(' ')[0];
    }

    // 1. Fetch configurations for the date
    const configs = db.prepare(`
      SELECT line_number, seated_operators, target_hourly_benchmark 
      FROM stitching_line_configs 
      WHERE date = date(?)
    `).all(targetDate) as any[];

    const getConfig = (lineName: string, defaultOperators: number, defaultTarget: number) => {
      const found = configs.find(c => c.line_number === lineName);
      const operators = found ? found.seated_operators : defaultOperators;
      const hourlyTarget = found ? found.target_hourly_benchmark : defaultTarget;
      return {
        operators,
        hourlyTarget,
        dailyTarget: hourlyTarget * 8
      };
    };

    // 2. Fetch records for the day for each department
    const feedingRaw = db.prepare(`
      SELECT 
        s.quantity, 
        s.line_number, 
        s.created_at, 
        p.style_num,
        strftime('%H', s.created_at) as hour_part
      FROM ${sendUnion} s
      LEFT JOIN po_products p ON s.product_id = p.id
      WHERE s.status = 'accepted' AND date(s.created_at) = date(?)
    `).all(targetDate) as any[];

    const stitchingRaw = db.prepare(`
      SELECT 
        s.quantity, 
        s.line_number, 
        s.created_at, 
        p.style_num,
        strftime('%H', s.created_at) as hour_part
      FROM ${stitchUnion} s
      LEFT JOIN po_products p ON s.product_id = p.id
      WHERE s.status = 'accepted' AND date(s.created_at) = date(?)
        AND LOWER(TRIM(s.line_number)) IN ('1', '2', '3', '4', '5', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5')
    `).all(targetDate) as any[];

    const cuttingRaw = db.prepare(`
      SELECT 
        c.quantity, 
        c.created_at, 
        p.style_num,
        strftime('%H', c.created_at) as hour_part
      FROM ${cutUnion} c
      LEFT JOIN po_products p ON c.product_id = p.id
      WHERE c.status = 'accepted' AND date(c.created_at) = date(?)
    `).all(targetDate) as any[];

    const pressRaw = db.prepare(`
      SELECT 
        pcs_pressed as quantity, 
        created_at,
        'MIX' as style_num,
        strftime('%H', created_at) as hour_part
      FROM press_records
      WHERE date(created_at) = date(?)
    `).all(targetDate) as any[];

    const cartonRaw = db.prepare(`
      SELECT 
        pk.quantity, 
        pk.created_at, 
        p.style_num,
        strftime('%H', pk.created_at) as hour_part
      FROM ${packUnion} pk
      LEFT JOIN po_products p ON pk.product_id = p.id
      WHERE pk.packing_type = 'carton' AND pk.status = 'accepted' AND date(pk.created_at) = date(?)
    `).all(targetDate) as any[];

    const blisterRaw = db.prepare(`
      SELECT 
        pk.quantity, 
        pk.created_at, 
        p.style_num,
        strftime('%H', pk.created_at) as hour_part
      FROM ${packUnion} pk
      LEFT JOIN po_products p ON pk.product_id = p.id
      WHERE pk.packing_type = 'blister' AND pk.status = 'accepted' AND date(pk.created_at) = date(?)
    `).all(targetDate) as any[];

    // Hour slots mapping
    const hourSlots = [
      { start: '09', end: '10', label: '9:00 am - 10:00 am' },
      { start: '10', end: '11', label: '10:00 am - 11:00 am' },
      { start: '11', end: '12', label: '11:00 am - 12:00 pm' },
      { start: '12', end: '13', label: '12:00 pm - 1:00 pm' },
      { start: '14', end: '15', label: '2:00 pm - 3:00 pm' },
      { start: '15', end: '16', label: '3:00 pm - 4:00 pm' },
      { start: '16', end: '17', label: '4:00 pm - 5:00 pm' },
      { start: '17', end: '18', label: '5:00 pm - 6:00 pm' }
    ];

    // Helper to process a list of raw records for a specific filter
    const processRows = (
      rawRecords: any[], 
      rowId: string, 
      label: string, 
      lineFilter?: string,
      targetOverride?: { operators: number; hourlyTarget: number; dailyTarget: number },
      hideOperators: boolean = false
    ) => {
      // Filter records by line if needed
      let records = rawRecords;
      if (lineFilter) {
        records = rawRecords.filter(r => {
          const l = String(r.line_number || '').toLowerCase();
          const f = lineFilter.toLowerCase();
          return l.includes(f) || (f === 'line 1' && l === '1') || (f === 'line 2' && l === '2') || (f === 'line 3' && l === '3') || (f === 'line 4' && l === '4') || (f === 'line 5' && l === '5');
        });
      }

      const styles: string[] = [];
      const quantities: number[] = [];

      hourSlots.forEach(slot => {
        const slotRecords = records.filter(r => r.hour_part === slot.start);
        if (slotRecords.length > 0) {
          const totalQty = slotRecords.reduce((sum, r) => sum + r.quantity, 0);
          // Find all unique style numbers in this slot and join them with comma
          const uniqueStyles = Array.from(new Set(slotRecords.map(r => String(r.style_num || '0').trim())))
            .filter(s => s !== '0' && s !== '');
          uniqueStyles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
          const slotStyle = uniqueStyles.length > 0 ? uniqueStyles.join(', ') : '0';
          styles.push(slotStyle);
          quantities.push(totalQty);
        } else {
          styles.push('0');
          quantities.push(0);
        }
      });

      const totalQty = quantities.reduce((sum, q) => sum + q, 0);
      const operators = targetOverride ? targetOverride.operators : 0;
      const hourlyTarget = targetOverride ? targetOverride.hourlyTarget : 0;
      const dailyTarget = targetOverride ? targetOverride.dailyTarget : 0;
      const diff = totalQty - dailyTarget;

      let performance = '0%';
      if (dailyTarget > 0) {
        performance = `${Math.round((totalQty / dailyTarget) * 100)}%`;
      } else if (totalQty > 0) {
        performance = '100%';
      } else {
        performance = '0%';
      }

      return {
        rowId,
        label,
        styles,
        quantities,
        totalQty,
        dailyTarget,
        hourlyTarget,
        diff,
        performance,
        operators,
        hideOperators
      };
    };

    // Construct the rows
    const rows: any[] = [];

    // --- DETERMINE LINES TO PROCESS ---
    const possibleLines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
    
    // Filter lines that actually have records on this day
    const linesWithRecords = possibleLines.filter(lineName => {
      const hasFeeding = feedingRaw.some(r => {
        const l = String(r.line_number || '').toLowerCase();
        const f = lineName.toLowerCase();
        return l.includes(f) || 
               (f === 'line 1' && l === '1') || 
               (f === 'line 2' && l === '2') || 
               (f === 'line 3' && l === '3') || 
               (f === 'line 4' && l === '4') || 
               (f === 'line 5' && l === '5');
      });
      const hasStitching = stitchingRaw.some(r => {
        const l = String(r.line_number || '').toLowerCase();
        const f = lineName.toLowerCase();
        return l.includes(f) || 
               (f === 'line 1' && l === '1') || 
               (f === 'line 2' && l === '2') || 
               (f === 'line 3' && l === '3') || 
               (f === 'line 4' && l === '4') || 
               (f === 'line 5' && l === '5');
      });
      return hasFeeding || hasStitching;
    });

    // Show line if it has records on this day
    const linesToProcess = possibleLines.filter(l => linesWithRecords.includes(l));

    // --- FEEDING ---
    const feedingRows: any[] = [];
    linesToProcess.forEach(lineName => {
      let defaultTarget = 100;
      if (lineName === 'Line 1') defaultTarget = 0;
      else if (lineName === 'Line 2') defaultTarget = 150;
      else if (lineName === 'Line 3') defaultTarget = 75;
      else if (lineName === 'Line 4') defaultTarget = 88;
      else if (lineName === 'Line 5') defaultTarget = 100;

      const cfg = getConfig(`Feeding ${lineName}`, 0, defaultTarget);
      const row = processRows(feedingRaw, `feeding_${lineName.toLowerCase().replace(' ', '_')}`, `Feeding ${lineName.toUpperCase()}`, lineName, cfg, true);
      rows.push(row);
      feedingRows.push(row);
    });

    // Feeding Total Row
    const feedingTotalQuantities = hourSlots.map((_, idx) => feedingRows.reduce((sum, r) => sum + r.quantities[idx], 0));
    const feedingTotalQty = feedingTotalQuantities.reduce((sum, q) => sum + q, 0);
    const feedingTotalDailyTarget = feedingRows.reduce((sum, r) => sum + r.dailyTarget, 0);
    const feedingTotalHourlyTarget = feedingRows.reduce((sum, r) => sum + r.hourlyTarget, 0);
    const feedingTotalDiff = feedingTotalQty - feedingTotalDailyTarget;
    let feedingTotalPerformance = '0%';
    if (feedingTotalDailyTarget > 0) {
      feedingTotalPerformance = `${Math.round((feedingTotalQty / feedingTotalDailyTarget) * 100)}%`;
    } else if (feedingTotalQty > 0) {
      feedingTotalPerformance = '100%';
    } else {
      feedingTotalPerformance = '0%';
    }
    const feedingTotalOperators = 0; // No operators needed for Feeding

    rows.push({
      rowId: 'feeding_total',
      label: 'TOTAL PCS (FEEDING)',
      isTotalRow: true,
      styles: hourSlots.map(() => ''), // No style for total row
      quantities: feedingTotalQuantities,
      totalQty: feedingTotalQty,
      dailyTarget: feedingTotalDailyTarget,
      hourlyTarget: feedingTotalHourlyTarget,
      diff: feedingTotalDiff,
      performance: feedingTotalPerformance,
      operators: feedingTotalOperators,
      hideOperators: true
    });

    // --- STITCHING ---
    const stitchingRows: any[] = [];
    linesToProcess.forEach(lineName => {
      let defaultOperators = 20;
      let defaultTarget = 100;
      if (lineName === 'Line 1') { defaultOperators = 0; defaultTarget = 0; }
      else if (lineName === 'Line 2') { defaultOperators = 25; defaultTarget = 150; }
      else if (lineName === 'Line 3') { defaultOperators = 20; defaultTarget = 75; }
      else if (lineName === 'Line 4') { defaultOperators = 21; defaultTarget = 88; }
      else if (lineName === 'Line 5') { defaultOperators = 20; defaultTarget = 100; }

      const cfg = getConfig(lineName, defaultOperators, defaultTarget);
      const row = processRows(stitchingRaw, `stitching_${lineName.toLowerCase().replace(' ', '_')}`, `Stitching ${lineName.toUpperCase()}`, lineName, cfg, false);
      rows.push(row);
      stitchingRows.push(row);
    });

    // Stitching Total Row
    const stitchingTotalQuantities = hourSlots.map((_, idx) => stitchingRows.reduce((sum, r) => sum + r.quantities[idx], 0));
    const stitchingTotalQty = stitchingTotalQuantities.reduce((sum, q) => sum + q, 0);
    const stitchingTotalDailyTarget = stitchingRows.reduce((sum, r) => sum + r.dailyTarget, 0);
    const stitchingTotalHourlyTarget = stitchingRows.reduce((sum, r) => sum + r.hourlyTarget, 0);
    const stitchingTotalDiff = stitchingTotalQty - stitchingTotalDailyTarget;
    let stitchingTotalPerformance = '0%';
    if (stitchingTotalDailyTarget > 0) {
      stitchingTotalPerformance = `${Math.round((stitchingTotalQty / stitchingTotalDailyTarget) * 100)}%`;
    } else if (stitchingTotalQty > 0) {
      stitchingTotalPerformance = '100%';
    } else {
      stitchingTotalPerformance = '0%';
    }
    const stitchingTotalOperators = stitchingRows.reduce((sum, r) => sum + r.operators, 0);

    rows.push({
      rowId: 'stitching_total',
      label: 'TOTAL PCS (STITCHING)',
      isTotalRow: true,
      styles: hourSlots.map(() => ''),
      quantities: stitchingTotalQuantities,
      totalQty: stitchingTotalQty,
      dailyTarget: stitchingTotalDailyTarget,
      hourlyTarget: stitchingTotalHourlyTarget,
      diff: stitchingTotalDiff,
      performance: stitchingTotalPerformance,
      operators: stitchingTotalOperators,
      hideOperators: false
    });

    // --- CUTTING & FABRICATION ---
    const cuttingCfg = getConfig('Cutting & Fabrication', 4, 300);
    rows.push(processRows(cuttingRaw, 'cutting_fabrication', 'CUTTING & FABRICATION', undefined, cuttingCfg, false));

    // --- TRIMS STATUS ---
    const trimsCfg = getConfig('Trims Status', 4, 300);
    const trimsStyles = hourSlots.map(slot => {
       const hourlyFeedingQty = feedingRaw
         .filter(f => f.hour_part === slot.start)
         .reduce((sum, f) => sum + f.quantity, 0);
       return hourlyFeedingQty > 0 ? 'COMPLETE' : '';
    });

    const hasConfirmedCutting = feedingRaw.reduce((sum, f) => sum + f.quantity, 0) > 0;

    rows.push({
      rowId: 'trims_status',
      label: 'TRIMS STATUS',
      styles: trimsStyles,
      quantities: hourSlots.map(() => 0),
      totalQty: 0,
      dailyTarget: 0,
      hourlyTarget: 0,
      diff: 0,
      performance: hasConfirmedCutting ? 'COMPLETE' : '',
      operators: trimsCfg.operators,
      hideOperators: true
    });

    // --- PRESS ---
    const pressCfg = getConfig('Press', 2, 313);
    rows.push(processRows(pressRaw, 'press', 'PRESS', undefined, pressCfg, false));

    // --- CARTON PACKED ---
    const cartonCfg = getConfig('Carton Packed', 19, 313);
    rows.push(processRows(cartonRaw, 'carton_packed', 'carton packed', undefined, cartonCfg, false));

    // --- BLISTER PACKED ---
    const blisterCfg = getConfig('Blister Packed', 10, 200);
    rows.push(processRows(blisterRaw, 'blister_packed', 'blister packed', undefined, blisterCfg, false));

    res.json({
      date: targetDate,
      hourSlots: hourSlots.map(h => h.label),
      rows
    });

  } catch (error: any) {
    console.error('Failed to generate hourly report one-view:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET breakdown of records in a specific hourly slot
router.get('/status/hourly-slot-breakdown', authenticateToken, (req, res) => {
  try {
    const { date, rowId, hourPart } = req.query as { date: string; rowId: string; hourPart: string };
    if (!date || !rowId || !hourPart) {
      return res.status(400).json({ error: 'Missing required parameters: date, rowId, hourPart' });
    }

    let records: any[] = [];
    let tableName = '';

    if (rowId.startsWith('stitching_')) {
      tableName = 'stitch_records';
      const lineSuffix = rowId.replace('stitching_', '').replace('_', ' ');
      records = db.prepare(`
        SELECT 
          s.id,
          s.po_number,
          s.product_id,
          s.quantity,
          s.line_number,
          s.status,
          s.created_at,
          s.created_by,
          p.style_num,
          p.color,
          p.size,
          u.full_name as created_by_name,
          'stitch_records' as record_table
        FROM stitch_records s
        LEFT JOIN po_products p ON s.product_id = p.id
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.status = 'accepted' 
          AND date(s.created_at) = date(?)
          AND strftime('%H', s.created_at) = ?
          AND (
            LOWER(TRIM(s.line_number)) = ?
            OR LOWER(TRIM(s.line_number)) = ?
          )
        ORDER BY s.created_at DESC
      `).all(
        date, 
        hourPart, 
        lineSuffix.toLowerCase(), 
        lineSuffix.replace('line ', '').toLowerCase()
      ) as any[];
    } else if (rowId.startsWith('feeding_')) {
      tableName = 'send_records';
      const lineSuffix = rowId.replace('feeding_', '').replace('_', ' ');
      records = db.prepare(`
        SELECT 
          s.id,
          s.po_number,
          s.product_id,
          s.quantity,
          s.line_number,
          s.status,
          s.created_at,
          s.created_by,
          p.style_num,
          p.color,
          p.size,
          u.full_name as created_by_name,
          'send_records' as record_table
        FROM send_records s
        LEFT JOIN po_products p ON s.product_id = p.id
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.status = 'accepted' 
          AND date(s.created_at) = date(?)
          AND strftime('%H', s.created_at) = ?
          AND (
            LOWER(TRIM(s.line_number)) = ?
            OR LOWER(TRIM(s.line_number)) = ?
          )
        ORDER BY s.created_at DESC
      `).all(
        date, 
        hourPart, 
        lineSuffix.toLowerCase(), 
        lineSuffix.replace('line ', '').toLowerCase()
      ) as any[];
    } else if (rowId === 'cutting_fabrication') {
      tableName = 'cut_records';
      records = db.prepare(`
        SELECT 
          c.id,
          c.po_number,
          c.product_id,
          c.quantity,
          c.status,
          c.created_at,
          c.created_by,
          p.style_num,
          p.color,
          p.size,
          u.full_name as created_by_name,
          'cut_records' as record_table
        FROM cut_records c
        LEFT JOIN po_products p ON c.product_id = p.id
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.status = 'accepted' 
          AND date(c.created_at) = date(?)
          AND strftime('%H', c.created_at) = ?
        ORDER BY c.created_at DESC
      `).all(date, hourPart) as any[];
    } else if (rowId === 'press') {
      tableName = 'press_records';
      records = db.prepare(`
        SELECT 
          pr.id,
          'PRESS' as po_number,
          0 as product_id,
          pr.pcs_pressed as quantity,
          'accepted' as status,
          pr.created_at,
          pr.created_by,
          'MIX' as style_num,
          'MIX' as color,
          'MIX' as size,
          u.full_name as created_by_name,
          'press_records' as record_table
        FROM press_records pr
        LEFT JOIN users u ON pr.created_by = u.id
        WHERE date(pr.created_at) = date(?)
          AND strftime('%H', pr.created_at) = ?
        ORDER BY pr.created_at DESC
      `).all(date, hourPart) as any[];
    } else if (rowId === 'carton_packed') {
      tableName = 'pack_records';
      records = db.prepare(`
        SELECT 
          pk.id,
          pk.po_number,
          pk.product_id,
          pk.quantity,
          pk.cartons,
          pk.pcs_per_carton,
          pk.status,
          pk.created_at,
          pk.created_by,
          p.style_num,
          p.color,
          p.size,
          u.full_name as created_by_name,
          'pack_records' as record_table
        FROM pack_records pk
        LEFT JOIN po_products p ON pk.product_id = p.id
        LEFT JOIN users u ON pk.created_by = u.id
        WHERE pk.packing_type = 'carton' 
          AND pk.status = 'accepted'
          AND date(pk.created_at) = date(?)
          AND strftime('%H', pk.created_at) = ?
        ORDER BY pk.created_at DESC
      `).all(date, hourPart) as any[];
    } else if (rowId === 'blister_packed') {
      tableName = 'pack_records';
      records = db.prepare(`
        SELECT 
          pk.id,
          pk.po_number,
          pk.product_id,
          pk.quantity,
          pk.cartons,
          pk.pcs_per_carton,
          pk.status,
          pk.created_at,
          pk.created_by,
          p.style_num,
          p.color,
          p.size,
          u.full_name as created_by_name,
          'pack_records' as record_table
        FROM pack_records pk
        LEFT JOIN po_products p ON pk.product_id = p.id
        LEFT JOIN users u ON pk.created_by = u.id
        WHERE pk.packing_type = 'blister' 
          AND pk.status = 'accepted'
          AND date(pk.created_at) = date(?)
          AND strftime('%H', pk.created_at) = ?
        ORDER BY pk.created_at DESC
      `).all(date, hourPart) as any[];
    }

    res.json({
      date,
      rowId,
      hourPart,
      tableName,
      records
    });
  } catch (error: any) {
    console.error('Failed to get hourly slot breakdown:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST move or split-and-move a record to a different hour slot
router.post('/status/hourly-slot-move', authenticateToken, (req: any, res) => {
  try {
    const { table, recordId, targetDate, targetHour, moveQty } = req.body;
    
    if (!table || !recordId || !targetHour) {
      return res.status(400).json({ error: 'Missing required parameters: table, recordId, targetHour' });
    }

    const validTables = ['stitch_records', 'send_records', 'cut_records', 'finish_records', 'pack_records', 'press_records'];
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: `Invalid table name. Must be one of: ${validTables.join(', ')}` });
    }

    const existingRecord: any = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(recordId);
    if (!existingRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const finalDate = (targetDate && targetDate.trim() !== '') ? targetDate.trim() : (existingRecord.created_at ? existingRecord.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10));
    const padHour = String(targetHour).padStart(2, '0');
    const targetTimestamp = `${finalDate} ${padHour}:30:00`;

    const currentQty = table === 'press_records' ? (existingRecord.pcs_pressed || 0) : (existingRecord.quantity || 0);
    const qtyToMove = (moveQty !== undefined && moveQty !== null && Number(moveQty) > 0) ? Number(moveQty) : currentQty;

    if (qtyToMove <= 0) {
      return res.status(400).json({ error: 'Quantity to move must be greater than 0' });
    }

    if (qtyToMove > currentQty) {
      return res.status(400).json({ error: `Cannot move ${qtyToMove} pcs. Record only has ${currentQty} pcs available.` });
    }

    db.transaction(() => {
      if (qtyToMove === currentQty) {
        // Full Move: Update created_at
        db.prepare(`UPDATE ${table} SET created_at = ? WHERE id = ?`).run(targetTimestamp, recordId);
        logAudit(req.user.id, 'HOURLY_SLOT_MOVE', table, recordId, { created_at: existingRecord.created_at }, { created_at: targetTimestamp, quantity: currentQty });
      } else {
        // Partial Move / Split:
        const remainingQty = currentQty - qtyToMove;

        if (table === 'press_records') {
          db.prepare(`UPDATE press_records SET pcs_pressed = ? WHERE id = ?`).run(remainingQty, recordId);
          db.prepare(`
            INSERT INTO press_records (pcs_pressed, created_at, created_by)
            VALUES (?, ?, ?)
          `).run(qtyToMove, targetTimestamp, req.user.id);
        } else if (table === 'pack_records') {
          const pcsPerCtn = existingRecord.pcs_per_carton || 1;
          const remainingCartons = Math.max(1, Math.ceil(remainingQty / pcsPerCtn));
          const newCartons = Math.max(1, Math.ceil(qtyToMove / pcsPerCtn));

          db.prepare(`UPDATE pack_records SET quantity = ?, cartons = ? WHERE id = ?`).run(remainingQty, remainingCartons, recordId);
          db.prepare(`
            INSERT INTO pack_records (
              po_number, product_id, quantity, cartons, packing_type, pcs_per_carton,
              status, store_status, received_by, received_at, created_by, created_at, is_old_stock
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            existingRecord.po_number,
            existingRecord.product_id,
            qtyToMove,
            newCartons,
            existingRecord.packing_type,
            pcsPerCtn,
            existingRecord.status,
            existingRecord.store_status,
            existingRecord.received_by,
            existingRecord.received_at,
            req.user.id,
            targetTimestamp,
            existingRecord.is_old_stock || 0
          );
        } else if (table === 'stitch_records') {
          db.prepare(`UPDATE stitch_records SET quantity = ? WHERE id = ?`).run(remainingQty, recordId);
          db.prepare(`
            INSERT INTO stitch_records (
              po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at, is_old_stock
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            existingRecord.po_number,
            existingRecord.product_id,
            qtyToMove,
            existingRecord.line_number,
            existingRecord.status,
            existingRecord.received_by,
            existingRecord.received_at,
            req.user.id,
            targetTimestamp,
            existingRecord.is_old_stock || 0
          );
        } else if (table === 'send_records') {
          db.prepare(`UPDATE send_records SET quantity = ? WHERE id = ?`).run(remainingQty, recordId);
          db.prepare(`
            INSERT INTO send_records (
              po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            existingRecord.po_number,
            existingRecord.product_id,
            qtyToMove,
            existingRecord.line_number,
            existingRecord.status,
            existingRecord.received_by,
            existingRecord.received_at,
            req.user.id,
            targetTimestamp
          );
        } else if (table === 'cut_records') {
          db.prepare(`UPDATE cut_records SET quantity = ? WHERE id = ?`).run(remainingQty, recordId);
          db.prepare(`
            INSERT INTO cut_records (
              po_number, product_id, quantity, status, received_by, received_at, created_by, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            existingRecord.po_number,
            existingRecord.product_id,
            qtyToMove,
            existingRecord.status,
            existingRecord.received_by,
            existingRecord.received_at,
            req.user.id,
            targetTimestamp
          );
        }

        logAudit(req.user.id, 'HOURLY_SLOT_SPLIT_AND_MOVE', table, recordId, { originalQty: currentQty }, { remainingQty, movedQty: qtyToMove, targetTimestamp });
      }
    })();

    res.json({
      success: true,
      message: `Successfully moved ${qtyToMove} pcs to ${padHour}:00 slot.`
    });
  } catch (error: any) {
    console.error('Failed to move hourly slot record:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST update stitching line configs for a specific date
router.post('/status/stitching-line-configs', authenticateToken, (req, res) => {
  try {
    const { date, configs } = req.body;
    if (!date || !Array.isArray(configs)) {
      return res.status(400).json({ error: 'Date and configs array are required' });
    }

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO stitching_line_configs (date, line_number, seated_operators, target_hourly_benchmark)
      VALUES (date(?), ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      configs.forEach((cfg: any) => {
        insertStmt.run(
          date, 
          cfg.line_number, 
          parseInt(cfg.seated_operators) || 0, 
          parseInt(cfg.target_hourly_benchmark) || 0
        );
      });
    });

    transaction();
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to save stitching line configs:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Daily cutting totals ---
router.get('/status/daily-cutting', authenticateToken, (req, res) => {
  const data = db.prepare(`
    SELECT date(created_at) as date, SUM(quantity) as total 
    FROM ${cutUnion} 
    GROUP BY date(created_at)
    ORDER BY date(created_at) DESC
  `).all();
  res.json(data);
});

// --- Store/Finished Stock list ---
router.get('/store/stock', authenticateToken, (req, res) => {
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  const dateFilter = (startDate && endDate) 
    ? "AND date(created_at) BETWEEN date(?) AND date(?)" 
    : "";

  let whereClause = "WHERE available_pcs > 0";
  if (startDate && endDate) {
    whereClause = `
      WHERE available_pcs != 0 
         OR available_cartons != 0 
         OR EXISTS (SELECT 1 FROM ${packUnion} WHERE product_id = sub.product_id AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted' ${dateFilter})
         OR EXISTS (SELECT 1 FROM shipment_records WHERE product_id = sub.product_id ${dateFilter})
    `;
  }

  let queryStr = `
    SELECT * FROM (
      SELECT 
        p.id as product_id,
        p.po_number,
        p.style_num,
        p.color,
        p.size,
        p.item_num,
        p.line_num,
        COALESCE((SELECT SUM(quantity) FROM ${packUnion} WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted' ${dateFilter}), 0) -
        COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id ${dateFilter}), 0) -
        COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Carton Store' ${dateFilter}), 0) as available_pcs,
        COALESCE((SELECT SUM(cartons) FROM ${packUnion} WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted' ${dateFilter}), 0) -
        COALESCE((SELECT SUM(cartons) FROM shipment_records WHERE product_id = p.id ${dateFilter}), 0) -
        ROUND(CAST(COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Carton Store' ${dateFilter}), 0) AS REAL) / COALESCE((SELECT MAX(pcs_per_carton) FROM ${packUnion} WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted' AND pcs_per_carton > 0), 24), 2) as available_cartons,
        COALESCE((SELECT SUM(quantity) FROM ${packUnion} WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted'), 0) -
        COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) -
        COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Carton Store'), 0) as current_available_pcs,
        COALESCE((SELECT SUM(cartons) FROM ${packUnion} WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted'), 0) -
        COALESCE((SELECT SUM(cartons) FROM shipment_records WHERE product_id = p.id), 0) -
        ROUND(CAST(COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Carton Store'), 0) AS REAL) / COALESCE((SELECT MAX(pcs_per_carton) FROM ${packUnion} WHERE product_id = p.id AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted' AND pcs_per_carton > 0), 24), 2) as current_available_cartons
      FROM po_products p
    ) sub
    ${whereClause}
    ORDER BY po_number DESC, style_num ASC
  `;

  const placeholderCount = (queryStr.match(/\?/g) || []).length;
  const params: string[] = [];
  if (startDate && endDate) {
    for (let i = 0; i < placeholderCount; i++) {
      params.push(i % 2 === 0 ? startDate : endDate);
    }
  }

  const stock = db.prepare(queryStr).all(...params);
  res.json(stock);
});

// --- Working Date settings ---
router.get('/settings/working-date', authenticateToken, (req, res) => {
  const setting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'working_date'").get();
  res.json({ working_date: setting?.value || null });
});

router.post('/settings/working-date', authenticateToken, (req: any, res) => {
  const { working_date } = req.body;
  const userId = req.user.id;
  const user: any = db.prepare('SELECT id, username, full_name, role, can_change_time FROM users WHERE id = ?').get(userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const isUserAdmin = user.role === 'admin';
  const isSupervisor = user.role === 'supervisor';
  const hasTimePrivilege = isUserAdmin || isSupervisor || user.can_change_time === 1;

  if (!hasTimePrivilege) {
    return res.status(403).json({ error: 'Permission denied. Administrator or Supervisor access required.' });
  }

  const isReverting = !working_date || working_date.trim() === '';

  // Non-admin can only revert to real-time (or adjust time via /settings/working-time)
  if (!isUserAdmin && !isReverting) {
    return res.status(403).json({ 
      error: 'Only Administrators can set a custom calendar date. Supervisors can adjust working time or revert system clock to real-time.' 
    });
  }

  const setting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'working_date'").get();
  const currentWorkingDate = setting?.value || null;
  const valueToStore = isReverting ? null : working_date.trim();

  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('working_date', ?)").run(valueToStore);
  logAudit(userId, isReverting ? 'REVERT_TO_REALTIME' : 'SET_WORKING_DATE', 'system_settings', 'working_date', currentWorkingDate, valueToStore);

  // Auto-log notification if supervisor reverted
  if (isReverting) {
    try {
      db.prepare(`
        INSERT INTO permission_requests (
          user_id, 
          request_type, 
          requested_datetime, 
          reason, 
          status, 
          admin_notes, 
          reviewed_by, 
          reviewed_at
        ) VALUES (?, 'datetime_change', 'LIVE_REALTIME', ?, 'approved', 'Reverted to real-time clock', ?, CURRENT_TIMESTAMP)
      `).run(
        userId,
        `Reverted system clock to Real-Time by ${user.full_name} (@${user.username})`,
        userId
      );
    } catch {}
  }

  res.json({ 
    success: true, 
    working_date: valueToStore, 
    message: isReverting ? 'System clock successfully reverted to Real-Time.' : 'Working date updated successfully.' 
  });
});

// --- Working Time Adjustment (Supervisor, Non-admin with can_change_time OR Admin) ---
router.post('/settings/working-time', authenticateToken, (req: any, res) => {
  const userId = req.user.id;
  const user: any = db.prepare('SELECT id, username, full_name, role, can_change_time FROM users WHERE id = ?').get(userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const isUserAdmin = user.role === 'admin';
  const isSupervisor = user.role === 'supervisor';
  const hasTimePrivilege = isUserAdmin || isSupervisor || user.can_change_time === 1;

  if (!hasTimePrivilege) {
    return res.status(403).json({ 
      error: 'Permission denied. Direct time adjustment requires administrator/supervisor privileges or an assigned Time-Access permission.' 
    });
  }

  const { time, working_date: proposedDateTime, revert, action } = req.body;
  
  // Get current active working date
  const setting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'working_date'").get();
  const currentWorkingDate = setting?.value || null;

  // Handle explicit revert to real-time
  if (revert === true || action === 'revert' || time === 'revert' || time === 'live' || proposedDateTime === '' || proposedDateTime === null) {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('working_date', NULL)").run();
    logAudit(userId, 'REVERT_TO_REALTIME', 'system_settings', 'working_date', currentWorkingDate, null);

    try {
      db.prepare(`
        INSERT INTO permission_requests (
          user_id, request_type, requested_datetime, reason, status, admin_notes, reviewed_by, reviewed_at
        ) VALUES (?, 'datetime_change', 'LIVE_REALTIME', ?, 'approved', 'Reverted to real-time clock', ?, CURRENT_TIMESTAMP)
      `).run(userId, `Reverted system clock to Real-Time by ${user.full_name} (@${user.username})`, userId);
    } catch {}

    return res.json({
      success: true,
      working_date: null,
      message: 'System clock successfully reverted to Real-Time.'
    });
  }
  
  const activeWorkingDate = currentWorkingDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
  // Extract date part (YYYY-MM-DD)
  const currentDatePart = activeWorkingDate.slice(0, 10);
  let newTimestamp: string;

  if (time && typeof time === 'string') {
    // Expected format: HH:mm or HH:mm:ss
    const trimmedTime = time.trim();
    const timeMatch = trimmedTime.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!timeMatch) {
      return res.status(400).json({ error: 'Invalid time format. Please provide time in HH:mm or HH:mm:ss format.' });
    }
    const fullTime = timeMatch[3] ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}` : `${timeMatch[1]}:${timeMatch[2]}:00`;
    newTimestamp = `${currentDatePart} ${fullTime}`;
  } else if (proposedDateTime && typeof proposedDateTime === 'string') {
    const cleanProposed = proposedDateTime.trim().replace('T', ' ');
    const proposedDatePart = cleanProposed.slice(0, 10);
    
    // If not admin, strictly enforce that date part cannot change
    if (!isUserAdmin && proposedDatePart !== currentDatePart) {
      return res.status(400).json({ 
        error: `Date modification restricted. Non-admin users are only permitted to adjust the clock time, keeping the date locked to ${currentDatePart}. To change the production date, please submit an Admin Permission Request.` 
      });
    }
    
    newTimestamp = cleanProposed.length === 16 ? `${cleanProposed}:00` : cleanProposed;
  } else {
    return res.status(400).json({ error: 'Please provide a valid time (HH:mm) or datetime string.' });
  }

  // Update working date in system settings
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('working_date', ?)").run(newTimestamp);

  // Audit log
  logAudit(userId, 'DIRECT_TIME_CHANGE', 'system_settings', 'working_date', currentWorkingDate, newTimestamp);

  // Create an auto-approved notification entry in permission_requests so Admin is informed
  try {
    db.prepare(`
      INSERT INTO permission_requests (
        user_id, 
        request_type, 
        requested_datetime, 
        reason, 
        status, 
        admin_notes, 
        reviewed_by, 
        reviewed_at
      ) VALUES (?, 'datetime_change', ?, ?, 'approved', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      userId,
      newTimestamp,
      `Direct Time adjustment to ${newTimestamp.slice(11, 16)} by ${user.full_name} (@${user.username})`,
      `Auto-notified to Admin. Production date locked to ${currentDatePart}.`,
      userId
    );
  } catch (err) {
    console.error('Failed to log auto-approval permission request notification:', err);
  }

  res.json({ 
    success: true, 
    working_date: newTimestamp, 
    message: `System working time successfully updated to ${newTimestamp.slice(11, 16)} (Date locked: ${currentDatePart}). Admin has been notified.` 
  });
});

router.post('/settings/auto-reconcile', authenticateToken, isAdmin, (req, res) => {
  try {
    const products = db.prepare(`
      SELECT p.id, p.po_number, p.style_num, p.color, p.size
      FROM po_products p
    `).all() as any[];

    let adjustedCount = 0;
    const adjustments: any[] = [];
    const userId = (req as any).user?.id || 1;

    // Fetch working date to timestamp the alignment records
    const workingDate = getRecordTimestamp(req);

    db.transaction(() => {
      for (const p of products) {
        const pChanges: string[] = [];

        // Chronological ledger alignment logic to determine high-water deficit at any point in history
        const getDeficit = (predecessorEntries: any[], successorEntries: any[]) => {
          const combined: { type: 'pre' | 'suc'; qty: number; date: string; id: number }[] = [];
          
          predecessorEntries.forEach(e => {
            combined.push({ type: 'pre', qty: Number(e.quantity) || 0, date: e.created_at || '', id: e.id || 0 });
          });
          successorEntries.forEach(e => {
            combined.push({ type: 'suc', qty: Number(e.quantity) || 0, date: e.created_at || '', id: e.id || 0 });
          });
          
          combined.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            if (a.type !== b.type) return a.type === 'pre' ? -1 : 1;
            return a.id - b.id;
          });
          
          let running = 0;
          let minBal = 0;
          let minBalDate = '';
          for (const item of combined) {
            if (item.type === 'pre') {
              running += item.qty;
            } else {
              running -= item.qty;
            }
            if (running < minBal) {
              minBal = running;
              minBalDate = item.date;
            }
          }
          return {
            deficit: minBal < 0 ? Math.abs(minBal) : 0,
            date: minBalDate
          };
        };

        const queryReturns = (fromDept: string, toDept: string) => {
          return db.prepare(`
            SELECT id, quantity, created_at FROM return_records 
            WHERE product_id = ? AND status = 'accepted' AND from_department = ? AND to_department = ?
          `).all(p.id, fromDept, toDept) as any[];
        };

        // --- STAGE 5: Blister vs Carton packing ---
        const queryBlister = () => db.prepare(`
          SELECT id, quantity, created_at FROM pack_records 
          WHERE product_id = ? AND packing_type = 'blister' AND status = 'accepted'
        `).all(p.id) as any[];

        const queryCarton = () => db.prepare(`
          SELECT id, quantity, created_at FROM pack_records 
          WHERE product_id = ? AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 0 AND status != 'rejected'
        `).all(p.id) as any[];

        const { deficit: deficit5, date: date5 } = getDeficit(queryBlister(), queryCarton());
        if (deficit5 > 0) {
          const targetDate = date5 || workingDate;
          db.prepare(`
            INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, status, store_status, received_by, received_at, created_by, created_at)
            VALUES (?, ?, ?, 0, 'blister', 'accepted', 'accepted', ?, ?, ?, ?)
          `).run(p.po_number, p.id, deficit5, userId, targetDate, userId, targetDate);
          pChanges.push(`Blister Pack: +${deficit5} Pcs`);
        }

        // --- STAGE 4: Finishing vs Blister & Direct Carton Packing ---
        const queryFinishing = () => {
          const main = db.prepare(`
            SELECT id, quantity, created_at FROM finish_records 
            WHERE product_id = ? AND result = 'pass' AND status = 'accepted'
          `).all(p.id) as any[];
          const returns = queryReturns('Packing', 'Finishing');
          return [...main, ...returns.map(e => ({ ...e, quantity: -e.quantity }))];
        };

        const queryLooseConsumers = () => {
          const blister = queryBlister();
          const directCarton = db.prepare(`
            SELECT id, quantity, created_at FROM pack_records 
            WHERE product_id = ? AND packing_type = 'carton' AND COALESCE(is_direct_carton, 0) = 1 AND status != 'rejected'
          `).all(p.id) as any[];
          return [...blister, ...directCarton];
        };

        const { deficit: deficit4, date: date4 } = getDeficit(queryFinishing(), queryLooseConsumers());
        if (deficit4 > 0) {
          const targetDate = date4 || workingDate;
          db.prepare(`
            INSERT INTO finish_records (po_number, product_id, quantity, result, status, received_by, received_at, created_by, created_at)
            VALUES (?, ?, ?, 'pass', 'accepted', ?, ?, ?, ?)
          `).run(p.po_number, p.id, deficit4, userId, targetDate, userId, targetDate);
          pChanges.push(`Finishing: +${deficit4} Pcs`);
        }

        // --- STAGE 3: Stitching vs Finishing ---
        const queryStitching = () => {
          const main = db.prepare(`
            SELECT id, quantity, created_at FROM stitch_records 
            WHERE product_id = ? AND status = 'accepted'
          `).all(p.id) as any[];
          const returns = queryReturns('Finishing', 'Stitching');
          return [...main, ...returns.map(e => ({ ...e, quantity: -e.quantity }))];
        };

        const queryFinishAll = () => db.prepare(`
          SELECT id, quantity, created_at FROM finish_records 
          WHERE product_id = ? AND status != 'rejected'
        `).all(p.id) as any[];

        const { deficit: deficit3, date: date3 } = getDeficit(queryStitching(), queryFinishAll());
        if (deficit3 > 0) {
          const targetDate = date3 || workingDate;
          db.prepare(`
            INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
            VALUES (?, ?, ?, 'LINE 1', 'accepted', ?, ?, ?, ?)
          `).run(p.po_number, p.id, deficit3, userId, targetDate, userId, targetDate);
          pChanges.push(`Stitching: +${deficit3} Pcs`);
        }

        // --- STAGE 2: Sent (Feeding) vs Stitching ---
        const querySend = () => {
          const main = db.prepare(`
            SELECT id, quantity, created_at FROM send_records 
            WHERE product_id = ? AND status = 'accepted'
          `).all(p.id) as any[];
          const returns = queryReturns('Stitching', 'Feeding');
          return [...main, ...returns.map(e => ({ ...e, quantity: -e.quantity }))];
        };

        const queryStitchAll = () => db.prepare(`
          SELECT id, quantity, created_at FROM stitch_records 
          WHERE product_id = ? AND status != 'rejected'
        `).all(p.id) as any[];

        const { deficit: deficit2, date: date2 } = getDeficit(querySend(), queryStitchAll());
        if (deficit2 > 0) {
          const targetDate = date2 || workingDate;
          db.prepare(`
            INSERT INTO send_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
            VALUES (?, ?, ?, 'LINE 1', 'accepted', ?, ?, ?, ?)
          `).run(p.po_number, p.id, deficit2, userId, targetDate, userId, targetDate);
          pChanges.push(`Feeding: +${deficit2} Pcs`);
        }

        // --- STAGE 1: Cut vs Sent ---
        const queryCut = () => {
          const main = db.prepare(`
            SELECT id, quantity, created_at FROM cut_records 
            WHERE product_id = ? AND status = 'accepted'
          `).all(p.id) as any[];
          const returns = queryReturns('Feeding', 'Cutting');
          return [...main, ...returns.map(e => ({ ...e, quantity: -e.quantity }))];
        };

        const querySendAll = () => db.prepare(`
          SELECT id, quantity, created_at FROM send_records 
          WHERE product_id = ? AND status != 'rejected'
        `).all(p.id) as any[];

        const { deficit: deficit1, date: date1 } = getDeficit(queryCut(), querySendAll());
        if (deficit1 > 0) {
          const targetDate = date1 || workingDate;
          db.prepare(`
            INSERT INTO cut_records (po_number, product_id, quantity, status, received_by, received_at, created_by, created_at)
            VALUES (?, ?, ?, 'accepted', ?, ?, ?, ?)
          `).run(p.po_number, p.id, deficit1, userId, targetDate, userId, targetDate);
          pChanges.push(`Cut: +${deficit1} Pcs`);
        }

        if (pChanges.length > 0) {
          adjustedCount++;
          adjustments.push({
            po_number: p.po_number,
            style_num: p.style_num,
            color: p.color,
            size: p.size,
            changes: pChanges.join(', ')
          });
        }
      }
    })();

    res.json({
      success: true,
      adjustedCount,
      adjustments
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update estimated date for a specific po_product
router.put('/status/update-est-date', authenticateToken, (req, res) => {
  const { product_id, est_date } = req.body;
  if (!product_id) {
    return res.status(400).json({ error: 'Product ID is required' });
  }
  try {
    const result = db.prepare('UPDATE po_products SET est_date = ? WHERE id = ?').run(est_date || null, product_id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true, product_id, est_date });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Analytics Dashboard (Overall Department, Daily Trend, Hourly Breakdown) ---
router.get('/status/analytics', authenticateToken, (req, res) => {
  try {
    let targetDate = req.query.date as string;
    if (!targetDate || targetDate === 'null' || targetDate === 'undefined') {
      targetDate = getRecordTimestamp(req).split(' ')[0];
    }

    // Returns by department for net production calculation
    const returnedByDept = db.prepare(`
      SELECT from_department, SUM(quantity) as total 
      FROM ${returnUnion} 
      WHERE status != 'rejected'
      GROUP BY from_department
    `).all() as any[];

    const todayReturnedByDept = db.prepare(`
      SELECT from_department, SUM(quantity) as total 
      FROM ${returnUnion} 
      WHERE status != 'rejected' AND date(created_at) = date(?)
      GROUP BY from_department
    `).all(targetDate) as any[];

    const returnsMap: Record<string, number> = {};
    returnedByDept.forEach(r => {
      returnsMap[r.from_department] = r.total || 0;
    });

    const todayReturnsMap: Record<string, number> = {};
    todayReturnedByDept.forEach(r => {
      todayReturnsMap[r.from_department] = r.total || 0;
    });

    const fabricSummary = db.prepare(`
      SELECT 
        SUM(CASE WHEN record_type = 'inhouse' THEN quantity_kg ELSE 0 END) as total_received,
        SUM(CASE WHEN record_type = 'issue' THEN quantity_kg ELSE 0 END) as total_issued,
        SUM(CASE WHEN record_type = 'issue' AND date(created_at) = date(?) THEN quantity_kg ELSE 0 END) as today_issued
      FROM fabric_records
      WHERE status = 'accepted'
    `).get(targetDate) as any;

    const cuttingSummary = db.prepare(`
      SELECT 
        SUM(quantity) as total_cut,
        SUM(CASE WHEN date(created_at) = date(?) THEN quantity ELSE 0 END) as today_cut,
        SUM(CASE WHEN status = 'pending' THEN quantity ELSE 0 END) as pending_acceptance
      FROM ${cutUnion}
      WHERE status = 'accepted' OR status = 'pending'
    `).get(targetDate) as any;

    const sendingSummary = db.prepare(`
      SELECT 
        SUM(quantity) as total_sent,
        SUM(CASE WHEN date(created_at) = date(?) THEN quantity ELSE 0 END) as today_sent
      FROM ${sendUnion}
      WHERE status = 'accepted'
    `).get(targetDate) as any;

    const stitchingSummary = db.prepare(`
      SELECT 
        SUM(quantity) as total_stitched,
        SUM(CASE WHEN date(created_at) = date(?) THEN quantity ELSE 0 END) as today_stitched,
        COUNT(DISTINCT line_number) as active_lines
      FROM ${stitchUnion}
      WHERE status = 'accepted'
    `).get(targetDate) as any;

    const finishingSummary = db.prepare(`
      SELECT 
        SUM(CASE WHEN result = 'pass' THEN quantity ELSE 0 END) as total_passed,
        SUM(CASE WHEN result = 'reject' THEN quantity ELSE 0 END) as total_rejected,
        SUM(CASE WHEN result = 'pass' AND date(created_at) = date(?) THEN quantity ELSE 0 END) as today_passed,
        SUM(CASE WHEN result = 'reject' AND date(created_at) = date(?) THEN quantity ELSE 0 END) as today_rejected
      FROM ${finishUnion}
      WHERE status = 'accepted'
    `).get(targetDate, targetDate) as any;

    const packingSummary = db.prepare(`
      SELECT 
        SUM(quantity) as total_packed,
        SUM(CASE WHEN date(created_at) = date(?) THEN quantity ELSE 0 END) as today_packed,
        SUM(CASE WHEN status = 'pending' THEN quantity ELSE 0 END) as pending_store_handovers
      FROM ${packUnion}
      WHERE status = 'accepted'
    `).get(targetDate) as any;

    const shippingSummary = db.prepare(`
      SELECT 
        SUM(quantity) as total_shipped,
        SUM(CASE WHEN date(created_at) = date(?) THEN quantity ELSE 0 END) as today_shipped
      FROM shipment_records
    `).get(targetDate) as any;

    const pressSummary = db.prepare(`
      SELECT 
        SUM(pcs_pressed) as total_pressed,
        SUM(CASE WHEN date(created_at) = date(?) THEN pcs_pressed ELSE 0 END) as today_pressed,
        COUNT(*) as entry_count
      FROM press_records
    `).get(targetDate) as any;

    // Get current inventory count in store (total packed in cartons - total shipped)
    const storeInventory = db.prepare(`
      SELECT 
        SUM(quantity) as pcs_in_store
      FROM ${packUnion}
      WHERE packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted'
    `).get() as any;
    const totalShippedConst = db.prepare(`SELECT SUM(quantity) as qty FROM shipment_records`).get() as any;
    const currentStoreStock = Math.max(0, (storeInventory?.pcs_in_store || 0) - (totalShippedConst?.qty || 0));

    // Net values counting returns/scraps correctly
    const netTotalCut = Math.max(0, (cuttingSummary?.total_cut || 0) - (returnsMap['Feeding'] || 0));
    const netTodayCut = Math.max(0, (cuttingSummary?.today_cut || 0) - (todayReturnsMap['Feeding'] || 0));

    const netTotalSent = Math.max(0, (sendingSummary?.total_sent || 0) - (returnsMap['Stitching'] || 0));
    const netTodaySent = Math.max(0, (sendingSummary?.today_sent || 0) - (todayReturnsMap['Stitching'] || 0));

    const netTotalStitched = Math.max(0, (stitchingSummary?.total_stitched || 0) - (returnsMap['Finishing'] || 0));
    const netTodayStitched = Math.max(0, (stitchingSummary?.today_stitched || 0) - (todayReturnsMap['Finishing'] || 0));

    const netTotalPassed = Math.max(0, (finishingSummary?.total_passed || 0) - (returnsMap['Packing'] || 0));
    const netTodayPassed = Math.max(0, (finishingSummary?.today_passed || 0) - (todayReturnsMap['Packing'] || 0));

    const totalActiveLines = stitchingSummary?.active_lines || 0;
    const pendingFabric = Math.max(0, (fabricSummary?.total_received || 0) - (fabricSummary?.total_issued || 0));

    const departmentsData = [
      {
        id: 'fabric',
        name: 'Fabric & Stores',
        icon: 'Layers',
        metrics: [
          { label: 'Received (Kg)', value: Math.round(fabricSummary?.total_received || 0) },
          { label: 'Issued (Kg)', value: Math.round(fabricSummary?.total_issued || 0) },
          { label: 'Stock (Kg)', value: Math.round(pendingFabric) }
        ],
        status: pendingFabric > 0 ? 'Stocked' : 'Low Stock',
        color: 'text-sky-500 bg-sky-500/10'
      },
      {
        id: 'cutting',
        name: 'Cutting Dept',
        icon: 'Scissors',
        metrics: [
          { label: 'Total Cut Pcs', value: netTotalCut },
          { label: 'Today Cut', value: netTodayCut },
          { label: 'Pending Accept', value: cuttingSummary?.pending_acceptance || 0 }
        ],
        status: cuttingSummary?.pending_acceptance > 300 ? 'Attention' : 'Optimal',
        color: 'text-amber-500 bg-amber-500/10'
      },
      {
        id: 'sending',
        name: 'Feeding Dept',
        icon: 'Send',
        metrics: [
          { label: 'Total Sent', value: netTotalSent },
          { label: 'Today Sent', value: netTodaySent },
          { label: 'Returns Recv', value: returnsMap['Feeding'] || 0 }
        ],
        status: 'Optimal',
        color: 'text-emerald-500 bg-emerald-500/10'
      },
      {
        id: 'stitching',
        name: 'Stitching Dept',
        icon: 'Activity',
        metrics: [
          { label: 'Total Sewn', value: netTotalStitched },
          { label: 'Today Sewn', value: netTodayStitched },
          { label: 'Lines Active', value: totalActiveLines }
        ],
        status: totalActiveLines > 0 ? 'Operational' : 'Idle',
        color: 'text-indigo-500 bg-indigo-500/10'
      },
      {
        id: 'quality',
        name: 'QC & Finishing',
        icon: 'CheckCircle2',
        metrics: [
          { label: 'Passed Pcs', value: netTotalPassed },
          { label: 'Rejected Pcs', value: finishingSummary?.total_rejected || 0 },
          { label: 'Today Passed', value: netTodayPassed }
        ],
        status: (finishingSummary?.total_rejected / (finishingSummary?.total_passed + finishingSummary?.total_rejected || 1)) > 0.08 ? 'Warning - Quality' : 'Optimal',
        color: 'text-rose-500 bg-rose-500/10'
      },
      {
        id: 'packing',
        name: 'Packing Dept',
        icon: 'Package',
        metrics: [
          { label: 'Total Packed', value: packingSummary?.total_packed || 0 },
          { label: 'Today Packed', value: packingSummary?.today_packed || 0 },
          { label: 'Pending Store', value: packingSummary?.pending_store_handovers || 0 }
        ],
        status: packingSummary?.pending_store_handovers > 200 ? 'Attention' : 'Active',
        color: 'text-pink-500 bg-pink-500/10'
      },
      {
        id: 'shipping',
        name: 'Finished Goods',
        icon: 'Truck',
        metrics: [
          { label: 'Total Shipped', value: shippingSummary?.total_shipped || 0 },
          { label: 'In Store Stock', value: currentStoreStock },
          { label: 'Today Shipped', value: shippingSummary?.today_shipped || 0 }
        ],
        status: currentStoreStock > 0 ? 'Ready' : 'No Stock',
        color: 'text-teal-500 bg-teal-500/10'
      },
      {
        id: 'pressing',
        name: 'Pressing Dept',
        icon: 'CheckCircle',
        metrics: [
          { label: 'Total Pressed', value: pressSummary?.total_pressed || 0 },
          { label: 'Today Pressed', value: pressSummary?.today_pressed || 0 },
          { label: 'Avg Pcs/Entry', value: pressSummary?.entry_count > 0 ? Math.round((pressSummary?.total_pressed || 0) / pressSummary?.entry_count) : 0 }
        ],
        status: 'Optimal',
        color: 'text-purple-500 bg-purple-500/10'
      }
    ];

    // --- 2. DAILY PRODUCTION TREND ---
    const dailyCutting = db.prepare(`
      SELECT date(created_at) as day, SUM(quantity) as total 
      FROM ${cutUnion} 
      WHERE status = 'accepted'
      GROUP BY day ORDER BY day DESC LIMIT 10
    `).all() as any[];

    const dailyStitching = db.prepare(`
      SELECT date(created_at) as day, SUM(quantity) as total 
      FROM ${stitchUnion} 
      WHERE status = 'accepted'
      GROUP BY day ORDER BY day DESC LIMIT 10
    `).all() as any[];

    const dailyFinishing = db.prepare(`
      SELECT date(created_at) as day, SUM(quantity) as total 
      FROM ${finishUnion} 
      WHERE status = 'accepted' AND result = 'pass'
      GROUP BY day ORDER BY day DESC LIMIT 10
    `).all() as any[];

    const dailyPacking = db.prepare(`
      SELECT date(created_at) as day, SUM(quantity) as total 
      FROM ${packUnion} 
      WHERE status = 'accepted'
      GROUP BY day ORDER BY day DESC LIMIT 10
    `).all() as any[];

    const allDatesSet = new Set<string>();
    [dailyCutting, dailyStitching, dailyFinishing, dailyPacking].forEach(stageList => {
      stageList.forEach(item => {
        if (item.day) allDatesSet.add(item.day);
      });
    });

    allDatesSet.add(targetDate);
    const sortedDates = Array.from(allDatesSet).sort().slice(-10);

    const dailyProduction = sortedDates.map(d_string => {
      const cutItem = dailyCutting.find(item => item.day === d_string);
      const stitchItem = dailyStitching.find(item => item.day === d_string);
      const finishItem = dailyFinishing.find(item => item.day === d_string);
      const packItem = dailyPacking.find(item => item.day === d_string);

      return {
        date: d_string,
        Cutting: cutItem ? cutItem.total : 0,
        Stitching: stitchItem ? stitchItem.total : 0,
        Finishing: finishItem ? finishItem.total : 0,
        Packing: packItem ? packItem.total : 0
      };
    });

    // --- 3. HOURLY PRODUCTION ON targetDate ---
    const hourlyCutting = db.prepare(`
      SELECT strftime('%H:00', created_at) as hr, SUM(quantity) as total 
      FROM ${cutUnion} 
      WHERE status = 'accepted' AND date(created_at) = date(?)
      GROUP BY hr
    `).all(targetDate) as any[];

    const hourlyStitching = db.prepare(`
      SELECT strftime('%H:00', created_at) as hr, SUM(quantity) as total 
      FROM ${stitchUnion} 
      WHERE status = 'accepted' AND date(created_at) = date(?)
      GROUP BY hr
    `).all(targetDate) as any[];

    const hourlyFinishing = db.prepare(`
      SELECT strftime('%H:00', created_at) as hr, SUM(quantity) as total 
      FROM ${finishUnion} 
      WHERE status = 'accepted' AND result = 'pass' AND date(created_at) = date(?)
      GROUP BY hr
    `).all(targetDate) as any[];

    const hourlyPacking = db.prepare(`
      SELECT strftime('%H:00', created_at) as hr, SUM(quantity) as total 
      FROM ${packUnion} 
      WHERE status = 'accepted' AND date(created_at) = date(?)
      GROUP BY hr
    `).all(targetDate) as any[];

    // Standard hours
    const hoursSet = new Set<string>(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
    [hourlyCutting, hourlyStitching, hourlyFinishing, hourlyPacking].forEach(stageList => {
      stageList.forEach(item => {
        if (item.hr) hoursSet.add(item.hr);
      });
    });

    const sortedHours = Array.from(hoursSet).sort();

    const hourlyProduction = sortedHours.map(h_string => {
      const cutItem = hourlyCutting.find(item => item.hr === h_string);
      const stitchItem = hourlyStitching.find(item => item.hr === h_string);
      const finishItem = hourlyFinishing.find(item => item.hr === h_string);
      const packItem = hourlyPacking.find(item => item.hr === h_string);

      return {
        hour: h_string,
        Cutting: cutItem ? cutItem.total : 0,
        Stitching: stitchItem ? stitchItem.total : 0,
        Finishing: finishItem ? finishItem.total : 0,
        Packing: packItem ? packItem.total : 0
      };
    });

    res.json({
      target_date: targetDate,
      departments: departmentsData,
      daily_production: dailyProduction,
      hourly_production: hourlyProduction
    });
  } catch (error: any) {
    console.error('Failed to calculate analytics:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Calculates current net accepted production quantity for a specific style/color/size product
function getNetRecordedQty(productId: number, dept: string): number {
  let unionTable = '';
  let returnFromDept = '';
  let extraCondition = '';

  if (dept === 'cutting') {
    unionTable = '(SELECT * FROM cut_records UNION ALL SELECT * FROM archive_cut_records)';
    returnFromDept = 'Feeding';
  } else if (dept === 'feeding') {
    unionTable = '(SELECT * FROM send_records UNION ALL SELECT * FROM archive_send_records)';
    returnFromDept = 'Stitching';
  } else if (dept === 'stitching') {
    unionTable = '(SELECT * FROM stitch_records UNION ALL SELECT * FROM archive_stitch_records)';
    returnFromDept = 'Finishing';
  } else if (dept === 'finishing') {
    unionTable = '(SELECT * FROM finish_records UNION ALL SELECT * FROM archive_finish_records)';
    returnFromDept = 'Packing';
    extraCondition = " AND result = 'pass'";
  } else if (dept === 'packing') {
    unionTable = '(SELECT * FROM pack_records UNION ALL SELECT * FROM archive_pack_records)';
  }

  const totalRawObj: any = db.prepare(`SELECT SUM(quantity) as total FROM ${unionTable} WHERE product_id = ? AND status = 'accepted' ${extraCondition}`).get(productId);
  let totalRaw = totalRawObj?.total || 0;

  if (returnFromDept) {
    const returnObj: any = db.prepare(`SELECT SUM(quantity) as total FROM (SELECT * FROM return_records UNION ALL SELECT * FROM archive_return_records) WHERE product_id = ? AND status = 'accepted' AND from_department = ?`).get(productId, returnFromDept);
    totalRaw = Math.max(0, totalRaw - (returnObj?.total || 0));
  }

  return totalRaw;
}

// Get or dynamically create a specification product under the UNALLOCATED virtual PO
function getUnallocatedProductId(styleNum: string, color: string, size: string): { product_id: number; po_number: string } {
  const normStyle = styleNum.trim();
  const normalizedColor = normalizeToFullForm(color);
  const normSize = size.toUpperCase().trim();

  // Determine buyer dynamically based on style number (flagged)
  const buyerRaw = determineBuyerFromStyle(normStyle) || 'badger';
  const buyer = buyerRaw.toUpperCase();
  const virtualPoNum = `UNALLOCATED_${buyer}`;

  // Ensure custom virtual PO exists
  const checkPO: any = db.prepare("SELECT po_number FROM production_orders WHERE po_number = ?").get(virtualPoNum);
  if (!checkPO) {
    db.prepare(`
      INSERT INTO production_orders (po_number, buyer, season, floor, status, remarks, total_qty, total_value)
      VALUES (?, ?, 'N/A', 'N/A', 'Active', ?, 0, 0)
    `).run(virtualPoNum, buyerRaw, `Virtual PO for unallocated stock holding pool for buyer ${buyerRaw}`);
  }

  // Check if product exists under this virtual unallocated PO
  const checkProduct: any = db.prepare(`
    SELECT id FROM po_products 
    WHERE po_number = ?
      AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
      AND UPPER(TRIM(color)) = UPPER(TRIM(?))
      AND UPPER(TRIM(size)) = UPPER(TRIM(?))
    LIMIT 1
  `).get(virtualPoNum, normStyle, normalizedColor, normSize);

  if (checkProduct) {
    return { product_id: checkProduct.id, po_number: virtualPoNum };
  }

  // Create product under the custom unallocated PO with order qty = 0 (unassigned spec)
  const result = db.prepare(`
    INSERT INTO po_products (po_number, style_num, color, size, qty, unit_price, total_value)
    VALUES (?, ?, ?, ?, 0, 0, 0)
  `).run(virtualPoNum, normStyle, normalizedColor, normSize);

  return { product_id: result.lastInsertRowid as number, po_number: virtualPoNum };
}

// --- Excel Bulk Update for Department Stores ---
router.post('/store/bulk-update', authenticateToken, isAdmin, (req: any, res) => {
  const { department, records } = req.body;

  if (!department || !records || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Invalid parameters', message: 'Department and records are required.' });
  }

  const validDepts = ['cutting', 'feeding', 'stitching', 'finishing', 'packing'];
  if (!validDepts.includes(department)) {
    return res.status(400).json({ error: 'Invalid department', message: `Department must be one of: ${validDepts.join(', ')}` });
  }

  const dateToUse = getRecordTimestamp(req);

  let successCount = 0;

  const runWithTransaction = db.transaction(() => {
    records.forEach((rec, idx) => {
      const poNum = String(rec.po || rec.po_number || '').trim();
      const styleNum = String(rec.style || rec.style_num || '').trim();
      const color = String(rec.color || '').trim();
      const size = String(rec.size || '').trim();
      const qty = parseInt(String(rec.quantity || rec.qty || 0));

      if (!styleNum || !color || !size || isNaN(qty) || qty <= 0) {
        throw new Error(`Row #${idx + 1}: Missing or invalid data. (style: "${styleNum}", color: "${color}", size: "${size}", qty: ${qty})`);
      }

      const isAutoAllocated = !poNum || poNum.toUpperCase() === 'AUTO-ALLOCATED';

      let allocations: { product_id: number; po_number: string; qty: number }[] = [];

      // Helper function to perform FIFO allocation among Active POs for a given style/color/size
      const performFifoAllocation = (itemStyle: string, itemColor: string, itemSize: string, itemQty: number) => {
        let existingColors: string[] = db.prepare(`
          SELECT DISTINCT color FROM po_products 
          WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))
        `).all(itemStyle).map((c: any) => c.color);

        const mappedColor = getUnifiedColor(itemColor, existingColors);

        // Find all matching active POs for this style, color, size
        const matchedProducts = db.prepare(`
          SELECT p.id, p.po_number, p.qty as order_qty, po.delivery_date, po.priority
          FROM po_products p
          JOIN production_orders po ON p.po_number = po.po_number
          WHERE UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
            AND po.status = 'Active'
          ORDER BY 
            CASE po.priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Normal' THEN 3 ELSE 4 END ASC,
            COALESCE(po.delivery_date, '9999-12-31') ASC,
            po.po_number ASC
        `).all(itemStyle, mappedColor, itemSize) as { id: number, po_number: string, order_qty: number, delivery_date: string, priority: string }[];

        if (matchedProducts.length === 0) {
          // Fallback to UNALLOCATED virtual PO if no active orders match
          const unallocatedInfo = getUnallocatedProductId(itemStyle, itemColor, itemSize);
          return [{
            product_id: unallocatedInfo.product_id,
            po_number: unallocatedInfo.po_number,
            qty: itemQty
          }];
        }

        let remainingToAllocate = itemQty;
        const resAllocations: { product_id: number; po_number: string; qty: number }[] = [];

        for (const prod of matchedProducts) {
          if (remainingToAllocate <= 0) break;

          const netRecorded = getNetRecordedQty(prod.id, department);
          const remainingInPO = Math.max(0, prod.order_qty - netRecorded);

          if (remainingInPO > 0) {
            const allocAmount = Math.min(remainingToAllocate, remainingInPO);
            resAllocations.push({
              product_id: prod.id,
              po_number: prod.po_number,
              qty: allocAmount
            });
            remainingToAllocate -= allocAmount;
          }
        }

        // Handle surplus qty
        if (remainingToAllocate > 0) {
          // Deposit the remainder into the first prioritized active PO
          const firstAlloc = resAllocations.find(a => a.product_id === matchedProducts[0].id);
          if (firstAlloc) {
            firstAlloc.qty += remainingToAllocate;
          } else {
            resAllocations.push({
              product_id: matchedProducts[0].id,
              po_number: matchedProducts[0].po_number,
              qty: remainingToAllocate
            });
          }
          remainingToAllocate = 0;
        }

        return resAllocations;
      };

      if (!isAutoAllocated) {
        // 1. Find the PO representation. If no registered PO, fallback to FIFO Active PO lookup
        const checkPO: any = db.prepare(`
          SELECT po_number FROM production_orders 
          WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
        `).get(poNum);

        if (!checkPO) {
          // Fallback to FIFO Active PO lookup instead of immediate UNALLOCATED
          allocations = performFifoAllocation(styleNum, color, size, qty);
        } else {
          const actualPONum = checkPO.po_number;

          // 2. Map color dynamically by finding existing colors on this PO or globally for this Style
          let existingColors: string[] = db.prepare(`
            SELECT DISTINCT color FROM po_products 
            WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
              AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
          `).all(actualPONum, styleNum).map((c: any) => c.color);

          if (existingColors.length === 0) {
            existingColors = db.prepare(`
              SELECT DISTINCT color FROM po_products 
              WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))
            `).all(styleNum).map((c: any) => c.color);
          }

          const mappedColor = getUnifiedColor(color, existingColors);

          // 3. Find the Product size specific detail dynamically under the mapped color
          const checkProduct: any = db.prepare(`
            SELECT id FROM po_products 
            WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
              AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
              AND UPPER(TRIM(color)) = UPPER(TRIM(?))
              AND UPPER(TRIM(size)) = UPPER(TRIM(?))
            LIMIT 1
          `).get(actualPONum, styleNum, mappedColor, size);

          if (!checkProduct) {
            // Fallback to FIFO Active PO lookup instead of immediate UNALLOCATED
            allocations = performFifoAllocation(styleNum, color, size, qty);
          } else {
            allocations.push({
              product_id: checkProduct.id,
              po_number: actualPONum,
              qty: qty
            });
          }
        }
      } else {
        // AUTO-ALLOCATE FLOW via FIFO Active PO lookup
        allocations = performFifoAllocation(styleNum, color, size, qty);
      }

      // Live write allocations
      allocations.forEach(alloc => {
        const actualPONum = alloc.po_number;
        const product_id = alloc.product_id;
        const currentQty = alloc.qty;

        if (department === 'cutting') {
          const stmt = db.prepare(`
            INSERT INTO cut_records (po_number, product_id, quantity, status, created_by, created_at)
            VALUES (?, ?, ?, 'accepted', ?, ?)
          `);
          stmt.run(actualPONum, product_id, currentQty, req.user.id, dateToUse);
        } else if (department === 'feeding') {
          // Uploading to Feeding store adds cut records with 'accepted' so they remain in Feeding store and appear on Feeding Dept's form page
          const stmt = db.prepare(`
            INSERT INTO cut_records (po_number, product_id, quantity, status, created_by, created_at)
            VALUES (?, ?, ?, 'accepted', ?, ?)
          `);
          stmt.run(actualPONum, product_id, currentQty, req.user.id, dateToUse);
        } else if (department === 'stitching') {
          // Uploading to Stitching store adds send records (fed to stitching) with 'accepted' so they remain in Stitching store and appear on Stitching Dept's form page
          const line = String(rec.line_number || rec.line || 'Line 1').trim();
          const stmt = db.prepare(`
            INSERT INTO send_records (po_number, product_id, quantity, line_number, status, created_by, created_at)
            VALUES (?, ?, ?, ?, 'accepted', ?, ?)
          `);
          stmt.run(actualPONum, product_id, currentQty, line, req.user.id, dateToUse);
        } else if (department === 'finishing') {
          // Uploading to Finishing store adds stitch records with 'accepted' so they remain in Finishing store and appear on Finishing Dept's form page
          const line = String(rec.line_number || rec.line || 'Line 1').trim();
          const stmt = db.prepare(`
            INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, created_by, created_at)
            VALUES (?, ?, ?, ?, 'accepted', ?, ?)
          `);
          stmt.run(actualPONum, product_id, currentQty, line, req.user.id, dateToUse);
        } else if (department === 'packing') {
          const type = String(rec.packing_type || '').trim().toLowerCase();
          if (type === 'blister') {
            const stmt = db.prepare(`
              INSERT INTO pack_records (po_number, product_id, quantity, packing_type, status, store_status, created_by, created_at)
              VALUES (?, ?, ?, 'blister', 'accepted', 'accepted', ?, ?)
            `);
            stmt.run(actualPONum, product_id, currentQty, req.user.id, dateToUse);
          } else if (type === 'carton') {
            const cartonsVal = rec.cartons || rec.carton_count || rec.carton || rec.ctns;
            const pcsPerCartonVal = rec.pcs_per_carton || rec.pcs_per_ctn || rec.pcs_per_box;

            let cartons = cartonsVal ? parseInt(String(cartonsVal)) : null;
            let pcsPerCtn = pcsPerCartonVal ? parseInt(String(pcsPerCartonVal)) : null;

            if (!cartons && !pcsPerCtn) {
              cartons = 1;
              pcsPerCtn = currentQty;
            } else if (cartons && !pcsPerCtn) {
              pcsPerCtn = Math.round(currentQty / cartons);
            } else if (!cartons && pcsPerCtn) {
              cartons = Math.round(currentQty / pcsPerCtn);
            }

            if (cartons && pcsPerCtn && cartons * pcsPerCtn !== currentQty) {
              pcsPerCtn = Math.round(currentQty / cartons);
              if (cartons * pcsPerCtn !== currentQty) {
                cartons = 1;
                pcsPerCtn = currentQty;
              }
            }

            const stmt = db.prepare(`
              INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, status, store_status, created_by, created_at)
              VALUES (?, ?, ?, ?, 'carton', ?, 'accepted', 'accepted', ?, ?)
            `);
            stmt.run(actualPONum, product_id, currentQty, cartons, pcsPerCtn, req.user.id, dateToUse);
          } else {
            // 'loose' fallback -> finish_records represents input to packing
            const stmt = db.prepare(`
              INSERT INTO finish_records (po_number, product_id, quantity, result, status, created_by, created_at)
              VALUES (?, ?, ?, 'pass', 'accepted', ?, ?)
            `);
            stmt.run(actualPONum, product_id, currentQty, req.user.id, dateToUse);
          }
        }
      });

      successCount++;
    });
  });

  try {
    runWithTransaction();
    logAudit(req.user.id, 'BULK_UPDATE_EXCEL', 'po_products', department, null, { filesParsed: records.length });
    res.json({ success: true, count: successCount, message: `Successfully updated ${successCount} records in ${department} store.` });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update store', message: err.message });
  }
});

// Admin-only: delete store data
router.post('/store/delete', authenticateToken, isAdmin, (req: any, res) => {
  const { department, po_number, style_num, color, size, packing_type } = req.body;

  if (!department || !style_num || !color) {
    return res.status(400).json({ error: 'Invalid parameters', message: 'Department, style_num, and color are required.' });
  }

  const validDepts = ['cutting', 'feeding', 'stitching', 'finishing', 'packing', 'carton'];
  if (!validDepts.includes(department)) {
    return res.status(400).json({ error: 'Invalid department', message: `Department must be one of: ${validDepts.join(', ')}` });
  }

  try {
    // Resolve matching product ids
    const params: any[] = [style_num, color];
    let query = `
      SELECT id, po_number, size FROM po_products 
      WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))
        AND UPPER(TRIM(color)) = UPPER(TRIM(?))
    `;
    if (po_number) {
      query += ` AND UPPER(TRIM(po_number)) = UPPER(TRIM(?))`;
      params.push(po_number);
    }
    if (size) {
      query += ` AND UPPER(TRIM(size)) = UPPER(TRIM(?))`;
      params.push(size);
    }

    const matchedProducts = db.prepare(query).all(...params) as any[];

    if (matchedProducts.length === 0) {
      return res.json({ success: true, count: 0, message: 'No matching products found.' });
    }

    const runDeleteTransaction = db.transaction(() => {
      let deletedCount = 0;
      matchedProducts.forEach(prod => {
        const pId = prod.id;
        if (department === 'cutting') {
          const r1 = db.prepare('DELETE FROM cut_records WHERE product_id = ?').run(pId);
          const r2 = db.prepare('DELETE FROM archive_cut_records WHERE product_id = ?').run(pId);
          deletedCount += r1.changes + r2.changes;
        } else if (department === 'feeding') {
          const r1 = db.prepare('DELETE FROM send_records WHERE product_id = ?').run(pId);
          const r2 = db.prepare('DELETE FROM archive_send_records WHERE product_id = ?').run(pId);
          const r3 = db.prepare('DELETE FROM cut_records WHERE product_id = ?').run(pId);
          const r4 = db.prepare('DELETE FROM archive_cut_records WHERE product_id = ?').run(pId);
          deletedCount += r1.changes + r2.changes + r3.changes + r4.changes;
        } else if (department === 'stitching') {
          const r1 = db.prepare('DELETE FROM stitch_records WHERE product_id = ?').run(pId);
          const r2 = db.prepare('DELETE FROM archive_stitch_records WHERE product_id = ?').run(pId);
          const r3 = db.prepare('DELETE FROM send_records WHERE product_id = ?').run(pId);
          const r4 = db.prepare('DELETE FROM archive_send_records WHERE product_id = ?').run(pId);
          deletedCount += r1.changes + r2.changes + r3.changes + r4.changes;
        } else if (department === 'finishing') {
          const r1 = db.prepare('DELETE FROM finish_records WHERE product_id = ?').run(pId);
          const r2 = db.prepare('DELETE FROM archive_finish_records WHERE product_id = ?').run(pId);
          const r3 = db.prepare('DELETE FROM stitch_records WHERE product_id = ?').run(pId);
          const r4 = db.prepare('DELETE FROM archive_stitch_records WHERE product_id = ?').run(pId);
          deletedCount += r1.changes + r2.changes + r3.changes + r4.changes;
        } else if (department === 'packing' || department === 'carton') {
          let q1 = 'DELETE FROM pack_records WHERE product_id = ?';
          let q2 = 'DELETE FROM archive_pack_records WHERE product_id = ?';
          const deleteParams: any[] = [pId];

          if (department === 'carton') {
            q1 += " AND packing_type = 'carton'";
            q2 += " AND packing_type = 'carton'";
          } else if (packing_type) {
            q1 += " AND packing_type = ?";
            q2 += " AND packing_type = ?";
            deleteParams.push(packing_type);
          }

          const r1 = db.prepare(q1).run(...deleteParams);
          const r2 = db.prepare(q2).run(...deleteParams);
          deletedCount += r1.changes + r2.changes;
        }
      });
      return deletedCount;
    });

    const deletedCount = runDeleteTransaction();
    logAudit(req.user.id, 'DELETE_STORE', 'po_products', po_number || 'VARIOUS', null, { department, style_num, color, size, deletedCount });

    res.json({ success: true, count: deletedCount, message: `Successfully deleted store data for style "${style_num}" in ${department}.` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete store records', message: err.message });
  }
});

// Admin-only: bulk delete store data
router.post('/store/bulk-delete', authenticateToken, isAdmin, (req: any, res) => {
  const { department, items } = req.body;

  if (!department || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid parameters', message: 'Department and an array of items are required.' });
  }

  const validDepts = ['cutting', 'feeding', 'stitching', 'finishing', 'packing', 'carton'];
  if (!validDepts.includes(department)) {
    return res.status(400).json({ error: 'Invalid department', message: `Department must be one of: ${validDepts.join(', ')}` });
  }

  try {
    const runBulkDeleteTransaction = db.transaction(() => {
      let totalDeletedCount = 0;
      
      for (const item of items) {
        const { po_number, style_num, color, size, packing_type } = item;
        if (!style_num || !color) continue;

        // Resolve matching product ids
        const params: any[] = [style_num, color];
        let query = `
          SELECT id, po_number, size FROM po_products 
          WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(color)) = UPPER(TRIM(?))
        `;
        if (po_number) {
          query += ` AND UPPER(TRIM(po_number)) = UPPER(TRIM(?))`;
          params.push(po_number);
        }
        if (size) {
          query += ` AND UPPER(TRIM(size)) = UPPER(TRIM(?))`;
          params.push(size);
        }

        const matchedProducts = db.prepare(query).all(...params) as any[];

        matchedProducts.forEach(prod => {
          const pId = prod.id;
          if (department === 'cutting') {
            const r1 = db.prepare('DELETE FROM cut_records WHERE product_id = ?').run(pId);
            const r2 = db.prepare('DELETE FROM archive_cut_records WHERE product_id = ?').run(pId);
            totalDeletedCount += r1.changes + r2.changes;
          } else if (department === 'feeding') {
            const r1 = db.prepare('DELETE FROM send_records WHERE product_id = ?').run(pId);
            const r2 = db.prepare('DELETE FROM archive_send_records WHERE product_id = ?').run(pId);
            const r3 = db.prepare('DELETE FROM cut_records WHERE product_id = ?').run(pId);
            const r4 = db.prepare('DELETE FROM archive_cut_records WHERE product_id = ?').run(pId);
            totalDeletedCount += r1.changes + r2.changes + r3.changes + r4.changes;
          } else if (department === 'stitching') {
            const r1 = db.prepare('DELETE FROM stitch_records WHERE product_id = ?').run(pId);
            const r2 = db.prepare('DELETE FROM archive_stitch_records WHERE product_id = ?').run(pId);
            const r3 = db.prepare('DELETE FROM send_records WHERE product_id = ?').run(pId);
            const r4 = db.prepare('DELETE FROM archive_send_records WHERE product_id = ?').run(pId);
            totalDeletedCount += r1.changes + r2.changes + r3.changes + r4.changes;
          } else if (department === 'finishing') {
            const r1 = db.prepare('DELETE FROM finish_records WHERE product_id = ?').run(pId);
            const r2 = db.prepare('DELETE FROM archive_finish_records WHERE product_id = ?').run(pId);
            const r3 = db.prepare('DELETE FROM stitch_records WHERE product_id = ?').run(pId);
            const r4 = db.prepare('DELETE FROM archive_stitch_records WHERE product_id = ?').run(pId);
            totalDeletedCount += r1.changes + r2.changes + r3.changes + r4.changes;
          } else if (department === 'packing' || department === 'carton') {
            let q1 = 'DELETE FROM pack_records WHERE product_id = ?';
            let q2 = 'DELETE FROM archive_pack_records WHERE product_id = ?';
            const deleteParams: any[] = [pId];

            if (department === 'carton') {
              q1 += " AND packing_type = 'carton'";
              q2 += " AND packing_type = 'carton'";
            } else if (packing_type) {
              q1 += " AND packing_type = ?";
              q2 += " AND packing_type = ?";
              deleteParams.push(packing_type);
            }

            const r1 = db.prepare(q1).run(...deleteParams);
            const r2 = db.prepare(q2).run(...deleteParams);
            totalDeletedCount += r1.changes + r2.changes;
          }
        });
      }
      return totalDeletedCount;
    });

    const deletedCount = runBulkDeleteTransaction();
    logAudit(req.user.id, 'BULK_DELETE_STORE', 'po_products', 'MULTIPLE', null, { department, itemCount: items.length, deletedCount });

    res.json({ success: true, count: deletedCount, message: `Successfully deleted store data for ${items.length} styles/items in ${department}.` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to bulk delete store records', message: err.message });
  }
});

// GET unallocated holding pool records
router.get('/store/unallocated', authenticateToken, (req, res) => {
  try {
    const unallocatedRecords = db.prepare(`
      SELECT 'cutting' as department, p.style_num, p.color, p.size, r.id, r.quantity, r.created_at
      FROM cut_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.po_number LIKE 'UNALLOCATED%' AND r.status = 'accepted'
      
      UNION ALL
      
      SELECT 'feeding' as department, p.style_num, p.color, p.size, r.id, r.quantity, r.created_at
      FROM send_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.po_number LIKE 'UNALLOCATED%' AND r.status = 'accepted'
      
      UNION ALL
      
      SELECT 'stitching' as department, p.style_num, p.color, p.size, r.id, r.quantity, r.created_at
      FROM stitch_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.po_number LIKE 'UNALLOCATED%' AND r.status = 'accepted'
      
      UNION ALL
      
      SELECT 'finishing' as department, p.style_num, p.color, p.size, r.id, r.quantity, r.created_at
      FROM finish_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.po_number LIKE 'UNALLOCATED%' AND r.status = 'accepted'
      
      UNION ALL
      
      SELECT 'packing' as department, p.style_num, p.color, p.size, r.id, r.quantity, r.created_at
      FROM pack_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.po_number LIKE 'UNALLOCATED%' AND r.status = 'accepted'
    `).all() as any[];

    // Group by style, color, size, and department for visual summaries
    const groupedMap = new Map<string, {
      style: string;
      color: string;
      size: string;
      department: string;
      quantity: number;
      recordCount: number;
    }>();

    unallocatedRecords.forEach(rec => {
      const key = `${rec.style_num}||${rec.color}||${rec.size}||${rec.department}`;
      if (groupedMap.has(key)) {
        const existing = groupedMap.get(key)!;
        existing.quantity += rec.quantity;
        existing.recordCount += 1;
      } else {
        groupedMap.set(key, {
          style: rec.style_num,
          color: rec.color,
          size: rec.size,
          department: rec.department,
          quantity: rec.quantity,
          recordCount: 1
        });
      }
    });

    res.json({ unallocated: Array.from(groupedMap.values()) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch unallocated pool', message: err.message });
  }
});

// POST to reallocate unallocated stock to an official active Production Order
router.post('/store/reallocate', authenticateToken, (req: any, res) => {
  const { style, color, size, department, quantity, targetPoNumber } = req.body;

  if (!style || !color || !size || !department || !quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0 || !targetPoNumber) {
    return res.status(400).json({ error: 'Invalid parameters', message: 'Style, Color, Size, Department, quantity, and targetPoNumber are required.' });
  }

  const validDepts = ['cutting', 'feeding', 'stitching', 'finishing', 'packing'];
  if (!validDepts.includes(department)) {
    return res.status(400).json({ error: 'Invalid department', message: `Department must be one of: ${validDepts.join(', ')}` });
  }

  const qtyToMove = parseInt(quantity);

  // 1. Verify target PO exists
  const checkPO: any = db.prepare(`SELECT po_number FROM production_orders WHERE po_number = ?`).get(targetPoNumber);
  if (!checkPO) {
    return res.status(400).json({ error: 'Target PO not found', message: `Production Order "${targetPoNumber}" does not exist in active orders.` });
  }

  // 2. Map and verify target product spec exists on target PO with dynamic provisioning and color unification
  let existingColors: string[] = db.prepare(`
    SELECT DISTINCT color FROM po_products 
    WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
      AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
  `).all(targetPoNumber, style).map((c: any) => c.color);

  if (existingColors.length === 0) {
    existingColors = db.prepare(`
      SELECT DISTINCT color FROM po_products 
      WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))
    `).all(style).map((c: any) => c.color);
  }

  const mappedColor = getUnifiedColor(color, existingColors);

  let targetProduct: any = db.prepare(`
    SELECT id, po_number FROM po_products 
    WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
      AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
      AND UPPER(TRIM(color)) = UPPER(TRIM(?))
      AND UPPER(TRIM(size)) = UPPER(TRIM(?))
    LIMIT 1
  `).get(targetPoNumber, style, mappedColor, size);

  if (!targetProduct) {
    try {
      const insertRes = db.prepare(`
        INSERT INTO po_products (po_number, style_num, color, size, qty, unit_price, total_value)
        VALUES (?, ?, ?, ?, 0, 0, 0)
      `).run(targetPoNumber, style, mappedColor, size);

      targetProduct = {
        id: insertRes.lastInsertRowid as number,
        po_number: targetPoNumber
      };
      console.log(`[Reallocate-AutoProvision] Dynamically created product ID ${targetProduct.id} for PO "${targetPoNumber}", Style "${style}", Color "${mappedColor}", Size "${size}"`);
    } catch (createErr: any) {
      return res.status(400).json({ 
        error: 'Product mismatch', 
        message: `Failed to dynamically create specification for Style "${style}", Color "${color}", and Size "${size}" under PO "${targetPoNumber}": ${createErr.message}`
      });
    }
  }

  // 3. Select source unallocated records
  let tableName = '';
  if (department === 'cutting') tableName = 'cut_records';
  else if (department === 'feeding') tableName = 'send_records';
  else if (department === 'stitching') tableName = 'stitch_records';
  else if (department === 'finishing') tableName = 'finish_records';
  else if (department === 'packing') tableName = 'pack_records';

  const sourceRecords = db.prepare(`
    SELECT r.* FROM ${tableName} r
    JOIN po_products p ON r.product_id = p.id
    WHERE r.po_number LIKE 'UNALLOCATED%'
      AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
      AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
      AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
      AND r.status = 'accepted'
    ORDER BY r.created_at ASC
  `).all(style, color, size) as any[];

  const totalAvailable = sourceRecords.reduce((sum, r) => sum + r.quantity, 0);
  if (totalAvailable < qtyToMove) {
    return res.status(400).json({ error: 'Insufficient quantity', message: `Only ${totalAvailable} units are available in unallocated store pool.` });
  }

  let remainingToMove = qtyToMove;

  try {
    db.transaction(() => {
      for (const record of sourceRecords) {
        if (remainingToMove <= 0) break;

        if (record.quantity <= remainingToMove) {
          // Move whole record to target PO/product spec
          db.prepare(`UPDATE ${tableName} SET po_number = ?, product_id = ? WHERE id = ?`)
            .run(targetProduct.po_number, targetProduct.id, record.id);
          remainingToMove -= record.quantity;
        } else {
          // Split record
          db.prepare(`UPDATE ${tableName} SET quantity = quantity - ? WHERE id = ?`)
            .run(remainingToMove, record.id);

          if (department === 'cutting') {
            db.prepare(`
              INSERT INTO cut_records (po_number, product_id, quantity, status, received_by, received_at, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(targetProduct.po_number, targetProduct.id, remainingToMove, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
          } else if (department === 'feeding') {
            db.prepare(`
              INSERT INTO send_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(targetProduct.po_number, targetProduct.id, remainingToMove, record.line_number, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
          } else if (department === 'stitching') {
            db.prepare(`
              INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(targetProduct.po_number, targetProduct.id, remainingToMove, record.line_number, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
          } else if (department === 'finishing') {
            db.prepare(`
              INSERT INTO finish_records (po_number, product_id, quantity, result, status, received_by, received_at, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(targetProduct.po_number, targetProduct.id, remainingToMove, record.result, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
          } else if (department === 'packing') {
            db.prepare(`
              INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, status, store_status, received_by, received_at, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(targetProduct.po_number, targetProduct.id, remainingToMove, record.cartons, record.packing_type, record.pcs_per_carton, record.status, record.store_status, record.received_by, record.received_at, record.created_by, record.created_at);
          }

          remainingToMove = 0;
        }
      }
    })();

    logAudit(req.user.id, 'REALLOCATE_UNALLOCATED_STOCK', 'po_products', targetProduct.id, null, { style, color, size, department, reallocatedQty: qtyToMove, targetPO: targetPoNumber });
    res.json({ success: true, message: `Successfully reallocated ${qtyToMove} unallocated units to PO "${targetPoNumber}".` });
  } catch (err: any) {
    res.status(500).json({ error: 'Reallocation transaction failed', message: err.message });
  }
});

// POST to auto-allocate unallocated stock using FIFO and Priority rules
router.post('/store/auto-allocate', authenticateToken, (req: any, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid parameters', message: 'An array of items is required.' });
  }

  const results: any[] = [];

  try {
    db.transaction(() => {
      for (const item of items) {
        const { style, color, size, department, quantity } = item;
        if (!style || !color || !size || !department || !quantity) {
          continue;
        }

        const qtyToMove = parseInt(quantity);
        if (isNaN(qtyToMove) || qtyToMove <= 0) continue;

        let tableName = '';
        if (department === 'cutting') tableName = 'cut_records';
        else if (department === 'feeding') tableName = 'send_records';
        else if (department === 'stitching') tableName = 'stitch_records';
        else if (department === 'finishing') tableName = 'finish_records';
        else if (department === 'packing') tableName = 'pack_records';

        if (!tableName) continue;

        // 1. Get source unallocated records
        const sourceRecords = db.prepare(`
          SELECT r.* FROM ${tableName} r
          JOIN po_products p ON r.product_id = p.id
          WHERE r.po_number LIKE 'UNALLOCATED%'
            AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
            AND r.status = 'accepted'
          ORDER BY r.created_at ASC
        `).all(style, color, size) as any[];

        const totalAvailable = sourceRecords.reduce((sum, r) => sum + r.quantity, 0);
        if (totalAvailable <= 0) continue;

        const actualQtyToMove = Math.min(qtyToMove, totalAvailable);
        let remainingToMove = actualQtyToMove;

        // 2. Fetch candidate active POs matching this style/color/size
        const candidates = db.prepare(`
          SELECT po.po_number, po.priority, po.delivery_date, po.created_at, p.id as product_id, p.qty as target_order_qty
          FROM production_orders po
          JOIN po_products p ON po.po_number = p.po_number
          WHERE po.status = 'Active'
            AND po.po_number NOT LIKE 'UNALLOCATED%'
            AND po.po_number != 'UNIVERSAL'
            AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
        `).all(style, color, size) as any[];

        if (candidates.length === 0) {
          results.push({ item, success: false, reason: 'No active production order matches this specification.' });
          continue;
        }

        // 3. Sort candidates by Priority (Urgent > Normal > Low) then FIFO (delivery_date / created_at)
        const priorityOrder: Record<string, number> = { 'Urgent': 3, 'Normal': 2, 'Low': 1 };
        candidates.sort((a: any, b: any) => {
          const pA = priorityOrder[a.priority] || 2;
          const pB = priorityOrder[b.priority] || 2;
          if (pA !== pB) return pB - pA; // Higher priority first

          if (a.delivery_date && b.delivery_date) {
            const dA = new Date(a.delivery_date).getTime();
            const dB = new Date(b.delivery_date).getTime();
            if (dA !== dB) return dA - dB; // Earliest first (FIFO)
          } else if (a.delivery_date) {
            return -1;
          } else if (b.delivery_date) {
            return 1;
          }

          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // Oldest PO creation first (FIFO)
        });

        // 4. Determine unfilled capacity for each candidate
        for (const cand of candidates) {
          const accum = db.prepare(`
            SELECT SUM(quantity) as total FROM ${tableName} 
            WHERE product_id = ? AND po_number NOT LIKE 'UNALLOCATED%' AND status = 'accepted'
          `).get(cand.product_id) as any;
          const currentAlloc = accum?.total || 0;
          cand.unfilled = Math.max(0, cand.target_order_qty - currentAlloc);
        }

        // 5. Fill records iteratively
        for (const record of sourceRecords) {
          if (remainingToMove <= 0) break;

          const recordQty = Math.min(record.quantity, remainingToMove);
          let recordRemainingToAllocate = recordQty;

          // Try allocating to candidates with unfilled space first
          for (const cand of candidates) {
            if (recordRemainingToAllocate <= 0) break;
            if (cand.unfilled <= 0) continue;

            const allocationAmount = Math.min(recordRemainingToAllocate, cand.unfilled);
            
            // Adjust original unallocated record quantity or move completely
            if (record.quantity === allocationAmount && recordRemainingToAllocate === allocationAmount) {
              db.prepare(`UPDATE ${tableName} SET po_number = ?, product_id = ? WHERE id = ?`)
                .run(cand.po_number, cand.product_id, record.id);
            } else {
              db.prepare(`UPDATE ${tableName} SET quantity = quantity - ? WHERE id = ?`)
                .run(allocationAmount, record.id);

              // Insert split record under target PO
              if (department === 'cutting') {
                db.prepare(`
                  INSERT INTO cut_records (po_number, product_id, quantity, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(cand.po_number, cand.product_id, allocationAmount, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'feeding') {
                db.prepare(`
                  INSERT INTO send_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(cand.po_number, cand.product_id, allocationAmount, record.line_number, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'stitching') {
                db.prepare(`
                  INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(cand.po_number, cand.product_id, allocationAmount, record.line_number, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'finishing') {
                db.prepare(`
                  INSERT INTO finish_records (po_number, product_id, quantity, result, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(cand.po_number, cand.product_id, allocationAmount, record.result, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'packing') {
                db.prepare(`
                  INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, status, store_status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(cand.po_number, cand.product_id, allocationAmount, record.cartons, record.packing_type, record.pcs_per_carton, record.status, record.store_status, record.received_by, record.received_at, record.created_by, record.created_at);
              }
            }

            cand.unfilled -= allocationAmount;
            recordRemainingToAllocate -= allocationAmount;
            remainingToMove -= allocationAmount;
          }

          // If there's still quantity remaining and all matching target orders are full, assign overflow to top candidate
          if (recordRemainingToAllocate > 0) {
            const topCand = candidates[0];
            if (record.quantity === recordRemainingToAllocate) {
              db.prepare(`UPDATE ${tableName} SET po_number = ?, product_id = ? WHERE id = ?`)
                .run(topCand.po_number, topCand.product_id, record.id);
            } else {
              db.prepare(`UPDATE ${tableName} SET quantity = quantity - ? WHERE id = ?`)
                .run(recordRemainingToAllocate, record.id);

              if (department === 'cutting') {
                db.prepare(`
                  INSERT INTO cut_records (po_number, product_id, quantity, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(topCand.po_number, topCand.product_id, recordRemainingToAllocate, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'feeding') {
                db.prepare(`
                  INSERT INTO send_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(topCand.po_number, topCand.product_id, recordRemainingToAllocate, record.line_number, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'stitching') {
                db.prepare(`
                  INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(topCand.po_number, topCand.product_id, recordRemainingToAllocate, record.line_number, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'finishing') {
                db.prepare(`
                  INSERT INTO finish_records (po_number, product_id, quantity, result, status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(topCand.po_number, topCand.product_id, recordRemainingToAllocate, record.result, record.status, record.received_by, record.received_at, record.created_by, record.created_at);
              } else if (department === 'packing') {
                db.prepare(`
                  INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, status, store_status, received_by, received_at, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(topCand.po_number, topCand.product_id, recordRemainingToAllocate, record.cartons, record.packing_type, record.pcs_per_carton, record.status, record.store_status, record.received_by, record.received_at, record.created_by, record.created_at);
              }
            }

            remainingToMove -= recordRemainingToAllocate;
          }
        }

        results.push({ item, success: true, allocated: actualQtyToMove });
        logAudit(req.user.id, 'AUTO_ALLOCATE_FIFO_PRIORITY', 'po_products', null, null, { style, color, size, department, quantity: actualQtyToMove });
      }
    })();

    res.json({ success: true, results, message: 'Auto-allocation processed successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Auto-allocation failed', message: err.message });
  }
});

// POST to change PO number for any specific department record
router.post('/store/change-record-po', authenticateToken, (req: any, res) => {
  const { id, department, newPoNumber } = req.body;
  if (!id || !department || !newPoNumber) {
    return res.status(400).json({ error: 'Missing parameters', message: 'id, department, and newPoNumber are required.' });
  }

  const validDepts = ['cutting', 'feeding', 'stitching', 'finishing', 'packing'];
  if (!validDepts.includes(department)) {
    return res.status(400).json({ error: 'Invalid department', message: `Department must be one of: ${validDepts.join(', ')}` });
  }

  let tableName = '';
  if (department === 'cutting') tableName = 'cut_records';
  else if (department === 'feeding') tableName = 'send_records';
  else if (department === 'stitching') tableName = 'stitch_records';
  else if (department === 'finishing') tableName = 'finish_records';
  else if (department === 'packing') tableName = 'pack_records';

  // Find the record
  const record = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id) as any;
  if (!record) {
    return res.status(404).json({ error: 'Record not found', message: `Record with ID ${id} not found in ${tableName}.` });
  }

  // Find the style, color, size of the existing record's product
  const originalProduct = db.prepare(`SELECT style_num, color, size FROM po_products WHERE id = ?`).get(record.product_id) as any;
  if (!originalProduct) {
    return res.status(400).json({ error: 'Original product not found', message: 'Could not resolve the style, color, size of this record.' });
  }

  // Verify target PO exists
  const checkPO = db.prepare(`SELECT po_number FROM production_orders WHERE po_number = ?`).get(newPoNumber);
  if (!checkPO) {
    return res.status(400).json({ error: 'Target PO not found', message: `Production Order "${newPoNumber}" does not exist.` });
  }

  // Get or create product specification under new PO with unified colors mapping
  let existingColors: string[] = db.prepare(`
    SELECT DISTINCT color FROM po_products 
    WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
      AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
  `).all(newPoNumber, originalProduct.style_num).map((c: any) => c.color);

  if (existingColors.length === 0) {
    existingColors = db.prepare(`
      SELECT DISTINCT color FROM po_products 
      WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))
    `).all(originalProduct.style_num).map((c: any) => c.color);
  }

  const mappedColor = getUnifiedColor(originalProduct.color, existingColors);

  let targetProduct = db.prepare(`
    SELECT id, po_number FROM po_products 
    WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
      AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
      AND UPPER(TRIM(color)) = UPPER(TRIM(?))
      AND UPPER(TRIM(size)) = UPPER(TRIM(?))
    LIMIT 1
  `).get(newPoNumber, originalProduct.style_num, mappedColor, originalProduct.size) as any;

  try {
    db.transaction(() => {
      if (!targetProduct) {
        // Auto-provision product for new PO
        const insertRes = db.prepare(`
          INSERT INTO po_products (po_number, style_num, color, size, qty, unit_price, total_value)
          VALUES (?, ?, ?, ?, 0, 0, 0)
        `).run(newPoNumber, originalProduct.style_num, mappedColor, originalProduct.size);

        targetProduct = {
          id: insertRes.lastInsertRowid as number,
          po_number: newPoNumber
        };
      }

      // Update the record to use the new PO and product ID
      db.prepare(`UPDATE ${tableName} SET po_number = ?, product_id = ? WHERE id = ?`)
        .run(newPoNumber, targetProduct.id, id);
    })();

    logAudit(req.user.id, 'CHANGE_RECORD_PO', tableName, id, { originalPoNum: record.po_number }, { newPoNumber, productId: targetProduct.id });
    res.json({ success: true, message: `Successfully updated PO of record ${id} to "${newPoNumber}".` });
  } catch (err: any) {
    res.status(500).json({ error: 'Transaction failed', message: err.message });
  }
});

// POST to reallocate carton store items dynamically based on the WIP FIFO of active POs
router.post('/store/reallocate-carton-fifo', authenticateToken, (req: any, res) => {
  const { style, color, size, current_po, quantity } = req.body;

  if (!style || !color || !size || !current_po) {
    return res.status(400).json({ error: 'Missing parameters', message: 'style, color, size, and current_po are required.' });
  }

  try {
    // 1. Fetch candidates from active POs matching Style, Color, Size
    const candidates = db.prepare(`
      SELECT po.po_number, po.priority, po.delivery_date, po.created_at, p.id as product_id, p.qty as target_order_qty
      FROM production_orders po
      JOIN po_products p ON po.po_number = p.po_number
      WHERE LOWER(po.status) = 'active'
        AND po.po_number NOT LIKE 'UNALLOCATED%'
        AND po.po_number != 'UNIVERSAL'
        AND po.po_number != ?
        AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
        AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
        AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
    `).all(current_po, style, color, size) as any[];

    if (candidates.length === 0) {
      return res.status(400).json({ 
        error: 'No active target PO', 
        message: `No other active PO contains style: ${style}, color: ${color}, size: ${size} specifications to reallocate into.`
      });
    }

    // 2. Sort candidates by Priority (Urgent > Normal > Low) then FIFO (earliest delivery_date, oldest creation date)
    const priorityOrder: Record<string, number> = { 'Urgent': 3, 'Normal': 2, 'Low': 1 };
    candidates.sort((a: any, b: any) => {
      const pA = priorityOrder[a.priority] || 2;
      const pB = priorityOrder[b.priority] || 2;
      if (pA !== pB) return pB - pA; // Higher priority first

      if (a.delivery_date && b.delivery_date) {
        const dA = new Date(a.delivery_date).getTime();
        const dB = new Date(b.delivery_date).getTime();
        if (dA !== dB) return dA - dB; // Earliest delivery first
      } else if (a.delivery_date) {
        return -1;
      } else if (b.delivery_date) {
        return 1;
      }

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // Oldest PO creation first
    });

    // 3. For each candidate, determine unfilled demand/capacity for this style/color/size
    // Capacity = PO Order Qty - existing accepted/packed records
    for (const cand of candidates) {
      const accum = db.prepare(`
        SELECT SUM(quantity) as total FROM pack_records 
        WHERE product_id = ? AND po_number = ? AND status = 'accepted' AND store_status = 'accepted'
      `).get(cand.product_id, cand.po_number) as any;
      const currentAlloc = accum?.total || 0;
      cand.unfilled = Math.max(0, cand.target_order_qty - currentAlloc);
    }

    // 4. Find the best candidate. We prefer the first candidate with unfilled > 0.
    // If all matching candidate POs are filled or over-allocated, fallback to candidates[0] (highest priority / earliest FIFO)
    let bestCand = candidates.find(c => c.unfilled > 0);
    if (!bestCand) {
      bestCand = candidates[0];
    }

    // Verify target product specification exists on target PO with dynamic provisioning
    let existingColors: string[] = db.prepare(`
      SELECT DISTINCT color FROM po_products 
      WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
        AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
    `).all(bestCand.po_number, style).map((c: any) => c.color);

    if (existingColors.length === 0) {
      existingColors = db.prepare(`
        SELECT DISTINCT color FROM po_products 
        WHERE UPPER(TRIM(style_num)) = UPPER(TRIM(?))
      `).all(style).map((c: any) => c.color);
    }

    const mappedColor = getUnifiedColor(color, existingColors);

    let targetProductSpec = db.prepare(`
      SELECT id, po_number FROM po_products 
      WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
        AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
        AND UPPER(TRIM(color)) = UPPER(TRIM(?))
        AND UPPER(TRIM(size)) = UPPER(TRIM(?))
      LIMIT 1
    `).get(bestCand.po_number, style, mappedColor, size) as any;

    if (!targetProductSpec) {
      const insertRes = db.prepare(`
        INSERT INTO po_products (po_number, style_num, color, size, qty, unit_price, total_value)
        VALUES (?, ?, ?, ?, 0, 0, 0)
      `).run(bestCand.po_number, style, mappedColor, size);

      targetProductSpec = {
        id: insertRes.lastInsertRowid as number,
        po_number: bestCand.po_number
      };
    }

    // 5. Gather source records from pack_records matching the current_po and specifications
    // Pack records are: store_status = 'accepted', status = 'accepted', packing_type = 'carton'
    const sourceRecords = db.prepare(`
      SELECT r.* FROM pack_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.po_number = ?
        AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
        AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
        AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
        AND r.packing_type = 'carton'
        AND r.status = 'accepted'
        AND r.store_status = 'accepted'
      ORDER BY r.created_at ASC
    `).all(current_po, style, color, size) as any[];

    const totalAvailable = sourceRecords.reduce((sum, r) => sum + r.quantity, 0);
    if (totalAvailable <= 0) {
      return res.status(400).json({ error: 'No stock available', message: 'No accepted dispatch stock is currently available to reallocate.' });
    }

    // Determine target order quantity of the current PO to retain
    const currentProduct = db.prepare(`
      SELECT id, qty FROM po_products
      WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?))
        AND UPPER(TRIM(style_num)) = UPPER(TRIM(?))
        AND UPPER(TRIM(color)) = UPPER(TRIM(?))
        AND UPPER(TRIM(size)) = UPPER(TRIM(?))
      LIMIT 1
    `).get(current_po, style, color, size) as any;
    const currentOrderQty = currentProduct ? (currentProduct.qty || 0) : 0;

    // Determine the exact number of pieces we are reallocating.
    // If quantity is passed, move up to quantity; otherwise, if there is surplus stock, move only the surplus, keeping the original ordered quantity on the current PO.
    let qtyToReallocate = totalAvailable;
    if (quantity) {
      qtyToReallocate = Math.min(parseInt(quantity), totalAvailable);
    } else if (totalAvailable > currentOrderQty) {
      qtyToReallocate = totalAvailable - currentOrderQty;
    }

    if (qtyToReallocate <= 0) {
      return res.status(400).json({
        error: 'No surplus to reallocate',
        message: `Current PO "${current_po}" has an order of ${currentOrderQty} pcs and only has ${totalAvailable} pcs in stock. There is no surplus stock to reallocate.`
      });
    }

    let remainingToMove = qtyToReallocate;

    // 6. Execute reallocation within a transaction
    db.transaction(() => {
      for (const record of sourceRecords) {
        if (remainingToMove <= 0) break;

        const recordQty = record.quantity;
        if (recordQty <= remainingToMove) {
          // Reallocate the entire record
          db.prepare(`UPDATE pack_records SET po_number = ?, product_id = ? WHERE id = ?`)
            .run(bestCand.po_number, targetProductSpec.id, record.id);
          remainingToMove -= recordQty;
        } else {
          // Record has more than we need. We must split it!
          // Deduct quantity and cartons on the original record proportionally
          const fraction = remainingToMove / recordQty;
          const originalCartons = record.cartons || 1;
          const targetCartons = Math.max(1, Math.round(originalCartons * fraction));
          
          db.prepare(`UPDATE pack_records SET quantity = quantity - ?, cartons = MAX(0, cartons - ?) WHERE id = ?`)
            .run(remainingToMove, targetCartons, record.id);

          // Insert split portion under the target PO
          db.prepare(`
            INSERT INTO pack_records (
              po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, 
              status, store_status, received_by, received_at, created_by, created_at, is_old_stock
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            bestCand.po_number, 
            targetProductSpec.id, 
            remainingToMove, 
            targetCartons, 
            record.packing_type, 
            record.pcs_per_carton, 
            record.status, 
            record.store_status, 
            record.received_by, 
            record.received_at, 
            record.created_by, 
            record.created_at,
            record.is_old_stock || 0
          );

          remainingToMove = 0;
        }
      }
    })();

    logAudit(req.user.id, 'REALLOCATE_CARTON_FIFO', 'pack_records', null, { originalPoNum: current_po }, { targetPoNumber: bestCand.po_number, reallocatedQty: qtyToReallocate, style, color, size });
    
    res.json({ 
      success: true, 
      targetPoNumber: bestCand.po_number,
      reallocatedQty: qtyToReallocate,
      message: `Successfully reallocated ${qtyToReallocate} units from PO "${current_po}" to PO "${bestCand.po_number}" based on FIFO WIP!` 
    });
  } catch (err: any) {
    console.error('Failed to reallocate carton FIFO:', err);
    res.status(500).json({ error: 'DB Error', message: err.message });
  }
});

// POST to execute a full master FIFO reallocation across all over-allocated stocks in the carton store
router.post('/store/reallocate-carton-fifo-master', authenticateToken, (req: any, res) => {
  try {
    // 1. Get all unique style, color, size combinations from accepted carton pack_records
    const uniqueSpecs = db.prepare(`
      SELECT DISTINCT 
        p.style_num, 
        p.color, 
        p.size
      FROM pack_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.packing_type = 'carton'
        AND r.status = 'accepted'
        AND r.store_status = 'accepted'
    `).all() as any[];

    let reallocateCount = 0;
    let totalReallocatedQty = 0;
    const reallocatedDetails: any[] = [];

    // We will do all reallocations within a single transaction
    db.transaction(() => {
      for (const spec of uniqueSpecs) {
        const style = spec.style_num;
        const color = spec.color;
        const size = spec.size;

        if (!style || !color || !size) continue;

        // Fetch all active target POs that contain this item spec
        const targetPOs = db.prepare(`
          SELECT po.po_number, po.priority, po.delivery_date, po.created_at, p.id as product_id, p.qty as required_qty
          FROM production_orders po
          JOIN po_products p ON po.po_number = p.po_number
          WHERE LOWER(po.status) = 'active'
            AND po.po_number NOT LIKE 'UNALLOCATED%'
            AND po.po_number != 'UNIVERSAL'
            AND UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
        `).all(style, color, size) as any[];

        if (targetPOs.length === 0) continue;

        // Sort target POs by Priority (Urgent > Normal > Low), then Earliest Delivery Date, then Oldest creation time (FIFO)
        const priorityOrder: Record<string, number> = { 'Urgent': 3, 'Normal': 2, 'Low': 1 };
        targetPOs.sort((a, b) => {
          const pA = priorityOrder[a.priority] || 2;
          const pB = priorityOrder[b.priority] || 2;
          if (pA !== pB) return pB - pA;

          if (a.delivery_date && b.delivery_date) {
            const dA = new Date(a.delivery_date).getTime();
            const dB = new Date(b.delivery_date).getTime();
            if (dA !== dB) return dA - dB;
          } else if (a.delivery_date) {
            return -1;
          } else if (b.delivery_date) {
            return 1;
          }
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        // Fetch all physical source pack records for this spec
        const records = db.prepare(`
          SELECT r.* FROM pack_records r
          JOIN po_products p ON r.product_id = p.id
          WHERE UPPER(TRIM(p.style_num)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.color)) = UPPER(TRIM(?))
            AND UPPER(TRIM(p.size)) = UPPER(TRIM(?))
            AND r.packing_type = 'carton'
            AND r.status = 'accepted'
            AND r.store_status = 'accepted'
          ORDER BY r.created_at ASC
        `).all(style, color, size) as any[];

        const totalAvailable = records.reduce((sum, r) => sum + r.quantity, 0);
        if (totalAvailable <= 0) continue;

        // We want to fill the required_qty of each targetPO in sorted order.
        let pool = records.map(r => ({ ...r, remaining: r.quantity }));
        const allocations: Array<{ targetPo: string; targetProductId: number; qty: number; sourceRecord: any }> = [];

        let activePOIdx = 0;
        let poolIdx = 0;

        // Fill each target PO's demand
        while (activePOIdx < targetPOs.length && poolIdx < pool.length) {
          const target = targetPOs[activePOIdx];
          let demand = target.required_qty;

          if (demand > 0) {
            while (demand > 0 && poolIdx < pool.length) {
              const packRec = pool[poolIdx];
              if (packRec.remaining <= 0) {
                poolIdx++;
                continue;
              }

              const take = Math.min(demand, packRec.remaining);
              allocations.push({
                targetPo: target.po_number,
                targetProductId: target.product_id,
                qty: take,
                sourceRecord: packRec,
              });

              demand -= take;
              packRec.remaining -= take;

              if (packRec.remaining <= 0) {
                poolIdx++;
              }
            }
          }
          activePOIdx++;
        }

        // If there is still physical stock left in the pool (surplus), assign it to the oldest/highest priority PO we found
        const primaryTarget = targetPOs[0];
        while (poolIdx < pool.length) {
          const packRec = pool[poolIdx];
          if (packRec.remaining > 0) {
            allocations.push({
              targetPo: primaryTarget.po_number,
              targetProductId: primaryTarget.product_id,
              qty: packRec.remaining,
              sourceRecord: packRec,
            });
            packRec.remaining = 0;
          }
          poolIdx++;
        }

        // Detect if any row actually changed its PO
        let reallocatedInSpec = 0;
        for (const alloc of allocations) {
          if (alloc.targetPo !== alloc.sourceRecord.po_number) {
            reallocatedInSpec += alloc.qty;
          }
        }

        if (reallocatedInSpec > 0) {
          // Delete old records of this spec, and insert new reallocated ones
          const recordIds = records.map(r => r.id);
          if (recordIds.length > 0) {
            const placeholders = recordIds.map(() => '?').join(',');
            db.prepare(`DELETE FROM pack_records WHERE id IN (${placeholders})`).run(...recordIds);
          }

          // Group the new allocations to prevent tiny split records
          const groupedAllocations: Record<string, any> = {};
          for (const alloc of allocations) {
            const src = alloc.sourceRecord;
            const key = `${alloc.targetPo}|${alloc.targetProductId}|${src.pcs_per_carton}|${src.received_by}|${src.received_at}|${src.is_old_stock || 0}`;

            if (!groupedAllocations[key]) {
              groupedAllocations[key] = {
                po_number: alloc.targetPo,
                product_id: alloc.targetProductId,
                quantity: 0,
                pcs_per_carton: src.pcs_per_carton,
                status: src.status,
                store_status: src.store_status,
                received_by: src.received_by,
                received_at: src.received_at,
                created_by: src.created_by,
                created_at: src.created_at,
                is_old_stock: src.is_old_stock || 0,
              };
            }
            groupedAllocations[key].quantity += alloc.qty;
          }

          // Insert regrouped records
          for (const key of Object.keys(groupedAllocations)) {
            const g = groupedAllocations[key];
            const pcsPerCtn = g.pcs_per_carton || 1;
            const cartons = Math.max(1, Math.ceil(g.quantity / pcsPerCtn));

            db.prepare(`
              INSERT INTO pack_records (
                po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, 
                status, store_status, received_by, received_at, created_by, created_at, is_old_stock
              )
              VALUES (?, ?, ?, ?, 'carton', ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              g.po_number,
              g.product_id,
              g.quantity,
              cartons,
              g.pcs_per_carton,
              g.status,
              g.store_status,
              g.received_by,
              g.received_at,
              g.created_by,
              g.created_at,
              g.is_old_stock
            );
          }

          reallocateCount++;
          totalReallocatedQty += reallocatedInSpec;
          reallocatedDetails.push({
            style,
            color,
            size,
            qty: reallocatedInSpec
          });
        }
      }
    })();

    if (totalReallocatedQty > 0) {
      logAudit(req.user.id, 'MASTER_REALLOCATE_CARTON_FIFO', 'pack_records', null, null, { reallocateCount, totalReallocatedQty, details: reallocatedDetails });
    }

    res.json({
      success: true,
      reallocateCount,
      totalReallocatedQty,
      message: `Master FIFO Reallocation complete. Adjusted all stock: Reallocated ${totalReallocatedQty} physical units across ${reallocateCount} product lines based on required VIP demand.`
    });
  } catch (err: any) {
    console.error('Failed run master carton FIFO:', err);
    res.status(500).json({ error: 'DB Error', message: err.message });
  }
});

// Adjust carton pieces/carton size for matching product and PO in Carton Store
router.post('/store/adjust-carton-size', authenticateToken, isAdmin, (req, res) => {
  const { product_id, po_number, pcs_per_carton } = req.body;
  
  if (!product_id || !po_number || !pcs_per_carton) {
    return res.status(400).json({ error: 'Missing required parameters: product_id, po_number, pcs_per_carton' });
  }

  const newValue = parseInt(String(pcs_per_carton));
  if (isNaN(newValue) || newValue <= 0) {
    return res.status(400).json({ error: 'pcs_per_carton must be a positive integer' });
  }

  try {
    db.transaction(() => {
      // Find all accepted carton pack records for this product and PO
      const records = db.prepare(`
        SELECT id, quantity, cartons FROM pack_records
        WHERE product_id = ?
          AND po_number = ?
          AND packing_type = 'carton'
          AND status = 'accepted'
          AND store_status = 'accepted'
      `).all(product_id, po_number) as any[];

      for (const r of records) {
        const newCartons = Math.ceil(r.quantity / newValue);
        db.prepare(`
          UPDATE pack_records
          SET pcs_per_carton = ?, cartons = ?
          WHERE id = ?
        `).run(newValue, newCartons, r.id);
      }
    })();

    logAudit((req as any).user.id, 'ADJUST_CARTON_SIZE', 'pack_records', null, { product_id, po_number }, { pcs_per_carton: newValue });
    res.json({ success: true, message: `Successfully adjusted carton packing specification to ${newValue} pcs per carton for PO: ${po_number}. Carton quantities adjusted accordingly.` });
  } catch (err: any) {
    console.error('Failed to adjust carton size:', err);
    res.status(500).json({ error: 'DB Error', message: err.message });
  }
});

export default router;
