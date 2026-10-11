import express from 'express';
import { db, determineBuyerFromStyle, normalizeToFullForm, getRecordTimestamp } from '../db';
import { authenticateToken } from '../middleware';

const router = express.Router();

// GET /api/old-stock: List old stock records across all department stores
router.get('/old-stock', authenticateToken, (req, res) => {
  try {
    const list = db.prepare(`
      SELECT 'feeding' as department, r.id, r.po_number, p.style_num, p.color, p.size, r.quantity, r.created_at, NULL as line_number
      FROM cut_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.is_old_stock = 1

      UNION ALL

      SELECT 'stitching' as department, r.id, r.po_number, p.style_num, p.color, p.size, r.quantity, r.created_at, r.line_number
      FROM send_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.is_old_stock = 1

      UNION ALL

      SELECT 'finishing' as department, r.id, r.po_number, p.style_num, p.color, p.size, r.quantity, r.created_at, r.line_number
      FROM stitch_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.is_old_stock = 1

      UNION ALL

      SELECT 'packing' as department, r.id, r.po_number, p.style_num, p.color, p.size, r.quantity, r.created_at, NULL as line_number
      FROM finish_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.is_old_stock = 1

      UNION ALL

      SELECT 'carton' as department, r.id, r.po_number, p.style_num, p.color, p.size, r.quantity, r.created_at, NULL as line_number
      FROM pack_records r
      JOIN po_products p ON r.product_id = p.id
      WHERE r.is_old_stock = 1

      ORDER BY created_at DESC
    `).all() as any[];

    res.json(list);
  } catch (err: any) {
    console.error('Failed to query old stock records:', err);
    res.status(500).json({ error: 'DB Error', message: err.message });
  }
});

// POST /api/old-stock: Create an old stock entry (inject direct department balance)
router.post('/old-stock', authenticateToken, (req, res) => {
  const { po_number, style_num, color, size, quantity, target_department, line_number, cartons, pcs_per_carton } = req.body;

  if (!style_num || !color || !size || !quantity || !target_department) {
    return res.status(400).json({ error: 'Missing required fields: style_num, color, size, quantity, target_department' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const validDepts = ['feeding', 'stitching', 'finishing', 'packing', 'carton'];
  if (!validDepts.includes(target_department)) {
    return res.status(400).json({ error: 'Invalid target_department. Must be one of: feeding, stitching, finishing, packing, carton' });
  }

  try {
    const normStyle = style_num.trim();
    const normColor = normalizeToFullForm(color);
    const normSize = size.toUpperCase().trim();

    // 1. Choose or deduce PO number
    let finalPo = String(po_number || '').trim();
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
        VALUES (?, ?, 'N/A', 'N/A', 'Active', 'Virtual PO for old stock and unallocated pool', 0, 0)
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

    const nowTimestamp = getRecordTimestamp(req);
    const userId = (req as any).user?.id || 1;

    let tableInserted = '';
    
    // Begin direct injection with status accepted so it bypasses approval wait and logs immediately
    if (target_department === 'feeding') {
      // Feeding store contains cut items waiting to be run
      db.prepare(`
        INSERT INTO cut_records (po_number, product_id, quantity, status, received_by, received_at, created_by, created_at, is_old_stock)
        VALUES (?, ?, ?, 'accepted', ?, ?, ?, ?, 1)
      `).run(finalPo, productId, qty, userId, nowTimestamp, userId, nowTimestamp);
      tableInserted = 'cut_records';
    } 
    else if (target_department === 'stitching') {
      // Stitching store contains fed items (requires line)
      const line = String(line_number || 'LINE 1').trim();
      db.prepare(`
        INSERT INTO send_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at, is_old_stock)
        VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?, 1)
      `).run(finalPo, productId, qty, line, userId, nowTimestamp, userId, nowTimestamp);
      tableInserted = 'send_records';
    } 
    else if (target_department === 'finishing') {
      // Finishing store contains stitched items (requires line)
      const line = String(line_number || 'LINE 1').trim();
      db.prepare(`
        INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, received_by, received_at, created_by, created_at, is_old_stock)
        VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?, 1)
      `).run(finalPo, productId, qty, line, userId, nowTimestamp, userId, nowTimestamp);
      tableInserted = 'stitch_records';
    } 
    else if (target_department === 'packing') {
      // Packing store contains finished items
      db.prepare(`
        INSERT INTO finish_records (po_number, product_id, quantity, result, status, received_by, received_at, created_by, created_at, is_old_stock)
        VALUES (?, ?, ?, 'pass', 'accepted', ?, ?, ?, ?, 1)
      `).run(finalPo, productId, qty, userId, nowTimestamp, userId, nowTimestamp);
      tableInserted = 'finish_records';
    } 
    else if (target_department === 'carton') {
      // Carton store contains packed items
      const ctnCount = cartons ? parseInt(String(cartons), 10) : 1;
      const pcsPerCtn = pcs_per_carton ? parseInt(String(pcs_per_carton), 10) : qty;
      
      db.prepare(`
        INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, status, store_status, received_by, received_at, created_by, created_at, is_old_stock)
        VALUES (?, ?, ?, ?, 'carton', ?, 'accepted', 'accepted', ?, ?, ?, ?, 1)
      `).run(finalPo, productId, qty, ctnCount, pcsPerCtn, userId, nowTimestamp, userId, nowTimestamp);
      tableInserted = 'pack_records';
    }

    res.json({ 
      success: true, 
      productId, 
      po_number: finalPo, 
      table: tableInserted,
      message: `Successfully injected ${qty} pcs of ${normStyle} / ${normColor} / ${normSize} into ${target_department} store.` 
    });
  } catch (err: any) {
    console.error('Failed to create old stock entry:', err);
    res.status(500).json({ error: 'DB Error', message: err.message });
  }
});

// DELETE /api/old-stock/:department/:id: Delete old stock records
router.delete('/old-stock/:department/:id', authenticateToken, (req, res) => {
  const { department, id } = req.params;

  const validDepts = ['feeding', 'stitching', 'finishing', 'packing', 'carton'];
  if (!validDepts.includes(department)) {
    return res.status(400).json({ error: 'Invalid department' });
  }

  let tableName = '';
  if (department === 'feeding') tableName = 'cut_records';
  else if (department === 'stitching') tableName = 'send_records';
  else if (department === 'finishing') tableName = 'stitch_records';
  else if (department === 'packing') tableName = 'finish_records';
  else if (department === 'carton') tableName = 'pack_records';

  try {
    const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ? AND is_old_stock = 1`).run(id);
    if (result.changes > 0) {
      res.json({ success: true, message: `Successfully deleted old stock record` });
    } else {
      res.status(404).json({ error: 'Not found', message: 'No old stock record matched search parameters' });
    }
  } catch (err: any) {
    console.error('Failed to delete old stock record:', err);
    res.status(500).json({ error: 'DB Error', message: err.message });
  }
});

export default router;
