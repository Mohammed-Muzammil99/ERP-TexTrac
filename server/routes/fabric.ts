import { Router } from 'express';
import { db, logAudit, getRecordTimestamp } from '../db';
import { authenticateToken, authorize } from '../middleware';

const router = Router();

// Get fabric records LIST
router.get('/fabric', authenticateToken, (req, res) => {
  const records = db.prepare(`
    SELECT f.*, u.full_name as recorder_name
    FROM fabric_records f
    LEFT JOIN users u ON f.created_by = u.id
    ORDER BY f.created_at DESC
  `).all();
  res.json(records);
});

// Create hand-registered fabric record
router.post('/fabric', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const { po_number, style_num, batch_id, fabric_name, gsm, record_type, color, quantity_kg, bypass_fabric_check } = req.body;
  const recordTimestamp = getRecordTimestamp(req);

  const transaction = db.transaction(() => {
    if (record_type === 'issue') {
      // Validate versus inhouse stock (global store balance by color/fabric/gsm)
      if (!bypass_fabric_check) {
        const stock: any = db.prepare(`
          SELECT SUM(CASE 
            WHEN record_type = 'inhouse' THEN quantity_kg 
            WHEN record_type = 'issue' AND status != 'rejected' THEN -quantity_kg 
            WHEN record_type = 'return' AND status = 'accepted' THEN quantity_kg 
            ELSE 0 
          END) as available_kg
          FROM fabric_records
          WHERE UPPER(TRIM(color)) = UPPER(TRIM(?))
            AND UPPER(TRIM(COALESCE(fabric_name, 'Standard'))) = UPPER(TRIM(COALESCE(?, 'Standard')))
            AND COALESCE(gsm, 0) = COALESCE(?, 0)
        `).get(color, fabric_name || 'Standard', gsm || 0);
        
        if ((stock?.available_kg || 0) < quantity_kg) {
          throw new Error(`Insufficient in-house stock for ${color}. Available: ${stock?.available_kg?.toFixed(2) || 0}kg`);
        }
      }
    } else if (record_type === 'consumption') {
       // Validate versus issued stock (PO-specific floor balance)
       if (!bypass_fabric_check) {
         const stock: any = db.prepare(`
          SELECT SUM(CASE 
            WHEN record_type = 'issue' AND status = 'accepted' THEN quantity_kg 
            WHEN record_type = 'return' THEN -quantity_kg 
            WHEN record_type = 'consumption' THEN -quantity_kg 
            ELSE 0 
          END) as available_kg
          FROM fabric_records
          WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?)) 
            AND UPPER(TRIM(color)) = UPPER(TRIM(?))
            AND UPPER(TRIM(COALESCE(fabric_name, 'Standard'))) = UPPER(TRIM(COALESCE(?, 'Standard')))
            AND COALESCE(gsm, 0) = COALESCE(?, 0)
        `).get(po_number, color, fabric_name || 'Standard', gsm || 0);

        if ((stock?.available_kg || 0) < quantity_kg) {
          throw new Error(`Insufficient floor stock for ${color}. Available: ${stock?.available_kg?.toFixed(2) || 0}kg`);
        }
       }
    }

    db.prepare(`
      INSERT INTO fabric_records (po_number, style_num, batch_id, fabric_name, gsm, record_type, color, quantity_kg, created_by, created_at, status)
      VALUES (TRIM(?), TRIM(?), ?, ?, ?, ?, TRIM(?), ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
    `).run(
      po_number, 
      style_num, 
      batch_id || null, 
      fabric_name || null, 
      gsm || null, 
      record_type, 
      color, 
      parseFloat(quantity_kg), 
      req.user.id, 
      recordTimestamp,
      (record_type === 'inhouse' || record_type === 'consumption') ? 'accepted' : 'pending'
    );
  });

  try {
    transaction();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Bulk fabric logs import
router.post('/fabric/bulk', authenticateToken, authorize(['operator', 'supervisor'], ['Cutting']), (req: any, res) => {
  const { records, bypass_fabric_check } = req.body;
  const recordTimestamp = getRecordTimestamp(req);
  
  const transaction = db.transaction((data: any[]) => {
    const stmt = db.prepare(`
      INSERT INTO fabric_records (po_number, style_num, batch_id, fabric_name, gsm, record_type, color, quantity_kg, created_by, created_at, status)
      VALUES (TRIM(?), TRIM(?), ?, ?, ?, ?, TRIM(?), ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
    `);
    
    const inhouseCheck = db.prepare(`
      SELECT SUM(CASE 
        WHEN record_type = 'inhouse' THEN quantity_kg 
        WHEN record_type = 'issue' AND status != 'rejected' THEN -quantity_kg 
        WHEN record_type = 'return' AND status = 'accepted' THEN quantity_kg 
        ELSE 0 
      END) as available_kg
      FROM fabric_records
      WHERE UPPER(TRIM(color)) = UPPER(TRIM(?))
        AND UPPER(TRIM(COALESCE(fabric_name, ''))) = UPPER(TRIM(COALESCE(?, '')))
        AND COALESCE(gsm, 0) = COALESCE(?, 0)
    `);

    const floorCheck = db.prepare(`
      SELECT SUM(CASE 
        WHEN record_type = 'issue' AND status = 'accepted' THEN quantity_kg 
        WHEN record_type = 'return' THEN -quantity_kg 
        WHEN record_type = 'consumption' THEN -quantity_kg 
        ELSE 0 
      END) as available_kg
      FROM fabric_records
      WHERE UPPER(TRIM(po_number)) = UPPER(TRIM(?)) 
        AND UPPER(TRIM(color)) = UPPER(TRIM(?))
        AND UPPER(TRIM(COALESCE(fabric_name, ''))) = UPPER(TRIM(COALESCE(?, '')))
        AND COALESCE(gsm, 0) = COALESCE(?, 0)
    `);

    for (const r of data) {
      if (r.quantity_kg > 0) {
        if (r.record_type === 'issue') {
          if (!bypass_fabric_check) {
            const stock: any = inhouseCheck.get(r.color, r.fabric_name || '', r.gsm || 0);
            if ((stock?.available_kg || 0) < r.quantity_kg) {
              throw new Error(`Insufficient in-house stock for ${r.color}. Available: ${stock?.available_kg?.toFixed(2) || 0}kg`);
            }
          }
        } else if (r.record_type === 'consumption') {
          if (!bypass_fabric_check) {
            const stock: any = floorCheck.get(r.po_number, r.color, r.fabric_name || '', r.gsm || 0);
            if ((stock?.available_kg || 0) < r.quantity_kg) {
              throw new Error(`Insufficient floor stock for ${r.color}. Available: ${stock?.available_kg?.toFixed(2) || 0}kg`);
            }
          }
        }
        stmt.run(
          r.po_number, 
          r.style_num, 
          r.batch_id || null, 
          r.fabric_name || null, 
          r.gsm || null, 
          r.record_type, 
          r.color, 
          parseFloat(r.quantity_kg), 
          req.user.id, 
          recordTimestamp,
          (r.record_type === 'inhouse' || r.record_type === 'consumption') ? 'accepted' : 'pending'
        );
      }
    }
  });

  try {
    transaction(records);
    logAudit(req.user.id, 'CREATE', 'fabric_records', 'bulk', null, records);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete fabric record
router.delete('/fabric/:id', authenticateToken, authorize(['supervisor'], ['Cutting']), (req: any, res) => {
  const old: any = db.prepare('SELECT * FROM fabric_records WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM fabric_records WHERE id = ?').run(req.params.id);
  if (old) logAudit(req.user.id, 'DELETE', 'fabric_records', req.params.id, old);
  res.json({ success: true });
});

// Update fabric record
router.put('/fabric/:id', authenticateToken, authorize(['supervisor'], ['Cutting']), (req: any, res) => {
  const { quantity_kg } = req.body;
  const old: any = db.prepare('SELECT * FROM fabric_records WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE fabric_records SET quantity_kg = ? WHERE id = ?').run(quantity_kg, parseInt(req.params.id));
  if (old) logAudit(req.user.id, 'UPDATE', 'fabric_records', req.params.id, old, { quantity_kg });
  res.json({ success: true });
});

// Cutting consumption stats
router.get('/cutting/consumption-stats', authenticateToken, (req, res) => {
  const { style_num } = req.query;
  
  try {
    const cutData = db.prepare(`
      SELECT UPPER(p.style_num) as style_num, UPPER(p.color) as color, SUM(c.quantity) as total_qty
      FROM cut_records c
      JOIN po_products p ON c.product_id = p.id
      ${style_num ? 'WHERE UPPER(p.style_num) = UPPER(?)' : ''}
      GROUP BY UPPER(p.style_num), UPPER(p.color)
    `).all(style_num ? [style_num] : []);

    const programData = db.prepare(`
      SELECT UPPER(p.style_num) as style_num, UPPER(p.color) as color, SUM(cp.planned_qty) as total_planned
      FROM cutting_programs cp
      JOIN po_products p ON cp.product_id = p.id
      ${style_num ? 'WHERE UPPER(p.style_num) = UPPER(?)' : ''}
      GROUP BY UPPER(p.style_num), UPPER(p.color)
    `).all(style_num ? [style_num] : []);

    const fabricData = db.prepare(`
      SELECT UPPER(style_num) as style_num, UPPER(color) as color, UPPER(fabric_name) as fabric_name, gsm,
      SUM(CASE WHEN record_type = 'inhouse' THEN quantity_kg ELSE 0 END) as total_inhouse,
      SUM(CASE WHEN record_type = 'issue' THEN quantity_kg ELSE 0 END) as total_issued,
      SUM(CASE WHEN record_type = 'return' THEN quantity_kg ELSE 0 END) as total_returned,
      SUM(CASE WHEN record_type = 'consumption' THEN quantity_kg ELSE 0 END) as total_consumed,
      SUM(CASE 
        WHEN record_type = 'inhouse' THEN quantity_kg 
        WHEN record_type = 'issue' THEN -quantity_kg 
        WHEN record_type = 'return' THEN quantity_kg 
        ELSE 0 
      END) as store_balance,
      SUM(CASE 
        WHEN record_type = 'issue' THEN quantity_kg 
        WHEN record_type = 'return' THEN -quantity_kg 
        WHEN record_type = 'consumption' THEN -quantity_kg 
        ELSE 0 
      END) as floor_balance
      FROM fabric_records
      ${style_num ? 'WHERE UPPER(style_num) = UPPER(?)' : ''}
      GROUP BY UPPER(style_num), UPPER(color), UPPER(fabric_name), gsm
    `).all(style_num ? [style_num] : []);

    const stats: any[] = [];
    
    fabricData.forEach((f: any) => {
      const relevantProducts = cutData.filter((p: any) => {
        if (p.style_num !== f.style_num) return false;
        const pColors = String(p.color || '').split('/').map((s: string) => s.trim().toUpperCase());
        return pColors.includes(String(f.color || '').trim().toUpperCase()) || p.color === f.color;
      });

      const relevantPrograms = programData.filter((p: any) => {
        if (p.style_num !== f.style_num) return false;
        const pColors = String(p.color || '').split('/').map((s: string) => s.trim().toUpperCase());
        return pColors.includes(String(f.color || '').trim().toUpperCase()) || p.color === f.color;
      });

      let totalProduced = 0;
      relevantProducts.forEach((p: any) => {
        totalProduced += (p.total_qty || 0);
      });

      let totalPlanned = 0;
      relevantPrograms.forEach((p: any) => {
        totalPlanned += (p.total_planned || 0);
      });
      
      stats.push({
        style_num: f.style_num,
        color: f.color,
        fabric_name: f.fabric_name,
        gsm: f.gsm,
        total_inhouse: f.total_inhouse,
        total_issued: f.total_issued,
        total_returned: f.total_returned,
        total_consumed: f.total_consumed,
        total_kg: f.total_consumed,
        store_balance: f.store_balance,
        floor_balance: f.floor_balance,
        total_qty: totalProduced,
        total_planned: totalPlanned,
        expected_consumption: totalPlanned > 0 ? (Number(f.total_issued) / totalPlanned).toFixed(3) : '0',
        actual_consumption: totalProduced > 0 ? (Number(f.total_consumed) / totalProduced).toFixed(3) : '0'
      });
    });

    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Fabric Types ---
router.get('/fabric-types', authenticateToken, (req, res) => {
  try {
    const types = db.prepare('SELECT * FROM fabric_types ORDER BY name ASC').all();
    res.json(types);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/fabric-types', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Fabric type name required' });
  try {
    db.prepare('INSERT INTO fabric_types (name) VALUES (?)').run(name.trim());
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: 'Fabric type already exists' });
  }
});

router.put('/fabric-types/:id', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Fabric type name is required' });
  try {
    const oldType: any = db.prepare('SELECT name FROM fabric_types WHERE id = ?').get(req.params.id);
    if (!oldType) return res.status(404).json({ error: 'Fabric type not found' });
    
    db.transaction(() => {
      db.prepare('UPDATE fabric_types SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
      db.prepare('UPDATE fabric_records SET fabric_name = ? WHERE fabric_name = ?').run(name.trim(), oldType.name);
    })();
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Fabric type already exists' });
  }
});

router.delete('/fabric-types/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM fabric_types WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Buyer GSM Rules ---
router.get('/buyer-gsm-rules', authenticateToken, (req, res) => {
  try {
    const rules = db.prepare('SELECT * FROM buyer_gsm_rules ORDER BY buyer ASC, fabric_type ASC').all();
    res.json(rules);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/buyer-gsm-rules', authenticateToken, (req, res) => {
  const { buyer, fabric_type, gsm } = req.body;
  if (!buyer || !fabric_type || !gsm) {
    return res.status(400).json({ error: 'buyer, fabric_type and gsm are required' });
  }
  try {
    db.prepare(`
      INSERT INTO buyer_gsm_rules (buyer, fabric_type, gsm)
      VALUES (?, ?, ?)
      ON CONFLICT(buyer, fabric_type) DO UPDATE SET gsm = excluded.gsm
    `).run(buyer.trim().toUpperCase(), fabric_type.trim().toUpperCase(), parseInt(gsm));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/buyer-gsm-rules/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM buyer_gsm_rules WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Style Consumption Rates ---
router.get('/style-consumption-rates', authenticateToken, (req, res) => {
  try {
    const rates = db.prepare(`
      SELECT id, style_num, fabric_type,
             COALESCE(greige_consumption, expected_consumption) as greige_consumption,
             COALESCE(process_loss_pct, 0) as process_loss_pct,
             expected_consumption,
             created_at
      FROM style_consumption_rates 
      ORDER BY style_num ASC, fabric_type ASC
    `).all();
    res.json(rates);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/style-consumption-rates', authenticateToken, (req, res) => {
  const { style_num, fabric_type, greige_consumption, process_loss_pct, expected_consumption } = req.body;
  if (!style_num || !fabric_type) {
    return res.status(400).json({ error: 'style_num and fabric_type are required' });
  }

  const lossPct = process_loss_pct !== undefined && process_loss_pct !== '' ? parseFloat(process_loss_pct) : 0;
  let finalGreige = greige_consumption !== undefined && greige_consumption !== '' ? parseFloat(greige_consumption) : null;
  let finalExpected = expected_consumption !== undefined && expected_consumption !== '' ? parseFloat(expected_consumption) : null;

  if (finalGreige !== null && !isNaN(finalGreige)) {
    finalExpected = parseFloat((finalGreige * (1 - lossPct / 100)).toFixed(4));
  } else if (finalExpected !== null && !isNaN(finalExpected)) {
    finalGreige = lossPct < 100 ? parseFloat((finalExpected / (1 - lossPct / 100)).toFixed(4)) : finalExpected;
  } else {
    return res.status(400).json({ error: 'Either greige_consumption or expected_consumption is required' });
  }

  try {
    db.prepare(`
      INSERT INTO style_consumption_rates (style_num, fabric_type, greige_consumption, process_loss_pct, expected_consumption)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(style_num, fabric_type) DO UPDATE SET 
        greige_consumption = excluded.greige_consumption,
        process_loss_pct = excluded.process_loss_pct,
        expected_consumption = excluded.expected_consumption
    `).run(style_num.trim().toUpperCase(), fabric_type.trim().toUpperCase(), finalGreige, lossPct, finalExpected);
    res.json({ success: true, greige_consumption: finalGreige, process_loss_pct: lossPct, expected_consumption: finalExpected });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/style-consumption-rates/bulk', authenticateToken, (req, res) => {
  const { rates } = req.body;
  if (!Array.isArray(rates) || rates.length === 0) {
    return res.status(400).json({ error: 'rates array is required' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO style_consumption_rates (style_num, fabric_type, greige_consumption, process_loss_pct, expected_consumption)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(style_num, fabric_type) DO UPDATE SET 
        greige_consumption = excluded.greige_consumption,
        process_loss_pct = excluded.process_loss_pct,
        expected_consumption = excluded.expected_consumption
    `);

    const transaction = db.transaction((rateList: any[]) => {
      for (const item of rateList) {
        const styleNum = String(item.style_num || '').trim().toUpperCase();
        const fabricType = String(item.fabric_type || '').trim().toUpperCase();
        if (!styleNum || !fabricType) continue;

        const lossPct = item.process_loss_pct !== undefined && item.process_loss_pct !== '' ? parseFloat(item.process_loss_pct) : 0;
        let greige = item.greige_consumption !== undefined && item.greige_consumption !== '' ? parseFloat(item.greige_consumption) : null;
        let expected = item.expected_consumption !== undefined && item.expected_consumption !== '' ? parseFloat(item.expected_consumption) : null;

        if (greige !== null && !isNaN(greige)) {
          expected = parseFloat((greige * (1 - lossPct / 100)).toFixed(4));
        } else if (expected !== null && !isNaN(expected)) {
          greige = lossPct < 100 ? parseFloat((expected / (1 - lossPct / 100)).toFixed(4)) : expected;
        } else {
          continue;
        }

        stmt.run(styleNum, fabricType, greige, lossPct, expected);
      }
    });

    transaction(rates);
    res.json({ success: true, count: rates.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/style-consumption-rates/update-loss-pct', authenticateToken, (req, res) => {
  const { ids, style_nums, process_loss_pct } = req.body;
  if (process_loss_pct === undefined || isNaN(parseFloat(process_loss_pct))) {
    return res.status(400).json({ error: 'Valid process_loss_pct is required' });
  }

  const lossPct = parseFloat(process_loss_pct);

  try {
    if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id, expected_consumption, greige_consumption FROM style_consumption_rates WHERE id IN (${placeholders})`).all(...ids);
      
      const updateStmt = db.prepare(`
        UPDATE style_consumption_rates 
        SET process_loss_pct = ?,
            expected_consumption = ROUND(COALESCE(NULLIF(greige_consumption, 0), expected_consumption) * (1 - ? / 100.0), 4),
            greige_consumption = COALESCE(NULLIF(greige_consumption, 0), expected_consumption)
        WHERE id = ?
      `);

      const tx = db.transaction((rateRows: any[]) => {
        for (const row of rateRows) {
          updateStmt.run(lossPct, lossPct, row.id);
        }
      });
      tx(rows);
      return res.json({ success: true, updatedCount: rows.length });
    } else if (Array.isArray(style_nums) && style_nums.length > 0) {
      const placeholders = style_nums.map(() => '?').join(',');
      const upperStyles = style_nums.map(s => String(s).trim().toUpperCase());
      const rows = db.prepare(`SELECT id, expected_consumption, greige_consumption FROM style_consumption_rates WHERE UPPER(style_num) IN (${placeholders})`).all(...upperStyles);

      const updateStmt = db.prepare(`
        UPDATE style_consumption_rates 
        SET process_loss_pct = ?,
            expected_consumption = ROUND(COALESCE(NULLIF(greige_consumption, 0), expected_consumption) * (1 - ? / 100.0), 4),
            greige_consumption = COALESCE(NULLIF(greige_consumption, 0), expected_consumption)
        WHERE id = ?
      `);

      const tx = db.transaction((rateRows: any[]) => {
        for (const row of rateRows) {
          updateStmt.run(lossPct, lossPct, row.id);
        }
      });
      tx(rows);
      return res.json({ success: true, updatedCount: rows.length });
    } else {
      const updateAll = db.prepare(`
        UPDATE style_consumption_rates 
        SET process_loss_pct = ?,
            expected_consumption = ROUND(COALESCE(NULLIF(greige_consumption, 0), expected_consumption) * (1 - ? / 100.0), 4),
            greige_consumption = COALESCE(NULLIF(greige_consumption, 0), expected_consumption)
      `);
      const result = updateAll.run(lossPct, lossPct);
      return res.json({ success: true, updatedCount: result.changes });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/style-consumption-rates/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM style_consumption_rates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Style Requirement & Procurement Summary ---
router.get('/style-requirement-summary/:style_num', authenticateToken, (req, res) => {
  try {
    const styleNum = req.params.style_num.trim().toUpperCase();
    const poNumber = req.query.po_number ? String(req.query.po_number).trim().toUpperCase() : null;
    const color = req.query.color ? String(req.query.color).trim().toUpperCase() : null;
    const extraPct = req.query.extra_pct ? parseFloat(String(req.query.extra_pct)) : 3;

    let query = `
      SELECT p.id, p.po_number, p.style_num, p.color, p.size, p.qty as order_qty, po.buyer,
             (SELECT COALESCE(planned_qty, 0) FROM cutting_programs WHERE product_id = p.id AND UPPER(TRIM(po_number)) = UPPER(TRIM(p.po_number))) as planned_qty,
             COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0), 0) -
             COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Feeding'), 0) -
             COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Cutting'), 0) as total_cut,
             COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as total_shipped,
             COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing'), 0) as total_rejected
      FROM po_products p
      JOIN production_orders po ON p.po_number = po.po_number
      WHERE UPPER(TRIM(p.style_num)) = ? AND po.status = 'Active'
    `;
    const queryParams: any[] = [styleNum];

    if (poNumber && poNumber !== 'ALL' && poNumber !== '') {
      query += ` AND UPPER(TRIM(p.po_number)) = ?`;
      queryParams.push(poNumber);
    }

    if (color && color !== 'ALL' && color !== '') {
      query += ` AND UPPER(TRIM(p.color)) = ?`;
      queryParams.push(color);
    }

    const products = db.prepare(query).all(...queryParams) as any[];

    let totalOrderQty = 0;
    let totalAlreadyCutQty = 0;
    let totalRemainingCutQty = 0;

    const buyersList = [...new Set(products.map(p => p.buyer).filter(Boolean))] as string[];

    products.forEach(p => {
      const originalQty = Number(p.order_qty) || 0;
      const plannedQty = Number(p.planned_qty) || 0;
      const totalShipped = Number(p.total_shipped) || 0;
      const prevCutAllTime = Number(p.total_cut) || 0;
      const totalRejected = Number(p.total_rejected) || 0;

      const unshippedQty = Math.max(0, originalQty - totalShipped);
      
      // Target goal per Cutting Management:
      // Always calculate order buffer as unshippedQty + extraPct buffer
      const targetGoal = extraPct > 0 ? Math.ceil(unshippedQty * (1 + extraPct / 100)) : unshippedQty;

      // Net active cut pieces on floor (excluding already shipped garments)
      const activeCut = Math.max(0, prevCutAllTime - totalShipped);
      const activeGoodCut = Math.max(0, activeCut - totalRejected);
      const balToCut = Math.max(0, targetGoal - activeGoodCut);

      totalOrderQty += unshippedQty;
      totalAlreadyCutQty += prevCutAllTime;
      totalRemainingCutQty += balToCut;
    });

    const rates = db.prepare(`
      SELECT * FROM style_consumption_rates 
      WHERE UPPER(TRIM(style_num)) = ?
      ORDER BY fabric_type ASC
    `).all(styleNum) as any[];

    const allGsmRules = db.prepare('SELECT * FROM buyer_gsm_rules').all() as any[];

    function findGsmRule(fabricType: string) {
      if (!buyersList.length) return null;
      const fUpper = fabricType.trim().toUpperCase();
      for (const buyerStr of buyersList) {
        const bUpper = buyerStr.trim().toUpperCase();
        const bTokens = bUpper.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        let preferredBuyer: string | null = null;
        if (styleNum.startsWith('5') && bTokens.includes('C2')) {
          preferredBuyer = 'C2';
        } else if (bTokens.includes('BADGER')) {
          preferredBuyer = 'BADGER';
        }
        if (preferredBuyer) {
          const rule = allGsmRules.find(r => r.buyer.trim().toUpperCase() === preferredBuyer && r.fabric_type.trim().toUpperCase() === fUpper);
          if (rule) return rule.gsm;
        }
        for (const token of bTokens) {
          const rule = allGsmRules.find(r => r.buyer.trim().toUpperCase() === token && r.fabric_type.trim().toUpperCase() === fUpper);
          if (rule) return rule.gsm;
        }
      }
      return null;
    }

    function getStoreStock(fabricName: string, targetColor: string | null, gsm: number | null) {
      let sql = `
        SELECT 
          COALESCE(SUM(CASE WHEN record_type = 'inhouse' THEN quantity_kg ELSE 0 END), 0) +
          COALESCE(SUM(CASE WHEN record_type = 'return' AND status = 'approved' THEN quantity_kg ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN record_type = 'issue' AND status != 'rejected' THEN quantity_kg ELSE 0 END), 0) as store_balance
        FROM fabric_records
        WHERE UPPER(TRIM(fabric_name)) = UPPER(TRIM(?))
      `;
      const pList: any[] = [fabricName];
      if (targetColor && targetColor !== 'ALL' && targetColor !== '') {
        sql += ` AND UPPER(TRIM(color)) = UPPER(TRIM(?))`;
        pList.push(targetColor);
      }
      if (gsm) {
        sql += ` AND gsm = ?`;
        pList.push(gsm);
      }
      const row = db.prepare(sql).get(...pList) as any;
      return Math.max(0, row ? row.store_balance : 0);
    }

    const targetColor = (color && color !== 'ALL') ? color : null;

    const fabricRequirements = rates.map(r => {
      const fabricType = r.fabric_type;
      const expectedConsumption = r.expected_consumption || 0;
      const requiredKg = totalRemainingCutQty * expectedConsumption;
      const gsmRule = findGsmRule(fabricType);

      const currentStoreStockKg = getStoreStock(fabricType, targetColor, gsmRule);
      const netNeededKg = Math.max(0, requiredKg - currentStoreStockKg);

      return {
        id: r.id,
        fabric_type: fabricType,
        expected_consumption: expectedConsumption,
        buyer_gsm: gsmRule,
        required_kg: parseFloat(requiredKg.toFixed(2)),
        current_store_stock_kg: parseFloat(currentStoreStockKg.toFixed(2)),
        net_needed_kg: parseFloat(netNeededKg.toFixed(2))
      };
    });

    res.json({
      style_num: styleNum,
      po_number: poNumber || 'ALL',
      color: color || 'ALL',
      buyers: buyersList,
      total_order_qty: totalOrderQty,
      total_already_cut_qty: totalAlreadyCutQty,
      total_remaining_cut_qty: totalRemainingCutQty,
      fabric_requirements: fabricRequirements
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Comprehensive Fabric Requirement & In-House Stock Report Across All Active Orders
router.get('/reports/fabric-requirement-stock', authenticateToken, (req, res) => {
  try {
    const extraPct = req.query.extra_pct ? parseFloat(String(req.query.extra_pct)) : 3;

    const activeOrders = db.prepare(`
      SELECT po.po_number, po.buyer, p.style_num, p.color, p.id as product_id, p.size, p.qty as original_qty,
             (SELECT COALESCE(planned_qty, 0) FROM cutting_programs WHERE product_id = p.id AND UPPER(TRIM(po_number)) = UPPER(TRIM(p.po_number))) as planned_qty,
             COALESCE((SELECT SUM(quantity) FROM cut_records WHERE product_id = p.id AND status != 'rejected' AND COALESCE(is_old_stock, 0) = 0), 0) -
             COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Feeding'), 0) -
             COALESCE((SELECT SUM(quantity) FROM discard_records WHERE product_id = p.id AND department = 'Cutting'), 0) as prev_cut_qty,
             COALESCE((SELECT SUM(quantity) FROM shipment_records WHERE product_id = p.id), 0) as total_shipped,
             COALESCE((SELECT SUM(quantity) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Finishing'), 0) as total_rejected
      FROM po_products p
      JOIN production_orders po ON p.po_number = po.po_number
      WHERE po.status = 'Active'
    `).all() as any[];

    const groups: Record<string, { buyers: Set<string>; style_num: string; color: string; items: any[] }> = {};
    activeOrders.forEach(p => {
      const s = (p.style_num || 'GENERAL').trim().toUpperCase();
      const c = (p.color || 'GENERAL').trim().toUpperCase();
      const key = `${s}|||${c}`;
      if (!groups[key]) {
        groups[key] = { buyers: new Set<string>(), style_num: s, color: c, items: [] };
      }
      if (p.buyer) groups[key].buyers.add(p.buyer);
      groups[key].items.push(p);
    });

    const consumptionRates = db.prepare('SELECT * FROM style_consumption_rates').all() as any[];
    const gsmRules = db.prepare('SELECT * FROM buyer_gsm_rules').all() as any[];

    function getStoreStock(fabricName: string, targetColor: string, gsm: number | null) {
      let sql = `
        SELECT 
          COALESCE(SUM(CASE WHEN record_type = 'inhouse' THEN quantity_kg ELSE 0 END), 0) +
          COALESCE(SUM(CASE WHEN record_type = 'return' AND status = 'approved' THEN quantity_kg ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN record_type = 'issue' AND status != 'rejected' THEN quantity_kg ELSE 0 END), 0) as store_balance
        FROM fabric_records
        WHERE UPPER(TRIM(fabric_name)) = UPPER(TRIM(?))
      `;
      const pList: any[] = [fabricName];
      if (targetColor && targetColor !== 'ALL') {
        sql += ` AND UPPER(TRIM(color)) = UPPER(TRIM(?))`;
        pList.push(targetColor);
      }
      if (gsm) {
        sql += ` AND gsm = ?`;
        pList.push(gsm);
      }
      const row = db.prepare(sql).get(...pList) as any;
      return Math.max(0, row ? row.store_balance : 0);
    }

    const report: any[] = [];

    Object.values(groups).forEach(g => {
      let balToCutSum = 0;
      g.items.forEach(p => {
        const originalQty = Number(p.original_qty) || 0;
        const plannedQty = Number(p.planned_qty) || 0;
        const totalShipped = Number(p.total_shipped) || 0;
        const prevCutAllTime = Number(p.prev_cut_qty) || 0;
        const totalRejected = Number(p.total_rejected) || 0;

        const unshippedQty = Math.max(0, originalQty - totalShipped);
        const targetGoal = extraPct > 0 ? Math.ceil(unshippedQty * (1 + extraPct / 100)) : unshippedQty;

        const activeCut = Math.max(0, prevCutAllTime - totalShipped);
        const activeGoodCut = Math.max(0, activeCut - totalRejected);

        balToCutSum += Math.max(0, targetGoal - activeGoodCut);
      });

      const rates = consumptionRates.filter(r => r.style_num.trim().toUpperCase() === g.style_num);
      const buyersList = Array.from(g.buyers);
      const buyerDisplay = buyersList.join(', ') || 'N/A';

      rates.forEach(r => {
        const expectedConsumption = r.expected_consumption || 0;
        const greigeConsumption = r.greige_consumption || expectedConsumption || 0;
        const processLossPct = r.process_loss_pct || 0;
        const reqKg = parseFloat((balToCutSum * expectedConsumption).toFixed(2));
        const greigeReqKg = parseFloat((balToCutSum * greigeConsumption).toFixed(2));
        
        // Resolve Buyer GSM Rule
        const fUpper = r.fabric_type.trim().toUpperCase();
        let gsm: number | null = null;
        for (const buyerStr of buyersList) {
          const bUpper = buyerStr.trim().toUpperCase();
          const bTokens = bUpper.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
          let preferredBuyer: string | null = null;
          if (g.style_num.startsWith('5') && bTokens.includes('C2')) preferredBuyer = 'C2';
          else if (bTokens.includes('BADGER')) preferredBuyer = 'BADGER';

          if (preferredBuyer) {
            const rule = gsmRules.find(rule => rule.buyer.trim().toUpperCase() === preferredBuyer && rule.fabric_type.trim().toUpperCase() === fUpper);
            if (rule) { gsm = rule.gsm; break; }
          }
          for (const token of bTokens) {
            const rule = gsmRules.find(rule => rule.buyer.trim().toUpperCase() === token && rule.fabric_type.trim().toUpperCase() === fUpper);
            if (rule) { gsm = rule.gsm; break; }
          }
          if (gsm) break;
        }

        const currentStock = getStoreStock(r.fabric_type, g.color, gsm);
        const netNeeded = Math.max(0, parseFloat((reqKg - currentStock).toFixed(2)));
        const excessKg = currentStock > reqKg ? parseFloat((currentStock - reqKg).toFixed(2)) : 0;

        let status: 'SHORTAGE' | 'COVERED' | 'EXTREME_EXCESS' = 'COVERED';
        if (currentStock < reqKg) {
          status = 'SHORTAGE';
        } else if (reqKg > 0 && currentStock > reqKg * 1.10) {
          status = 'EXTREME_EXCESS';
        } else if (reqKg === 0 && currentStock > 0) {
          status = 'EXTREME_EXCESS';
        }

        report.push({
          buyer: buyerDisplay,
          style: g.style_num,
          color: g.color,
          fabric_type: r.fabric_type,
          buyer_gsm: gsm ? `${gsm} GSM` : '—',
          gsm_number: gsm,
          target_cut_pcs: balToCutSum,
          greige_consumption: greigeConsumption,
          process_loss_pct: processLossPct,
          expected_consumption: expectedConsumption,
          current_stock_kg: parseFloat(currentStock.toFixed(2)),
          required_kg: reqKg,
          greige_required_kg: greigeReqKg,
          net_needed_kg: netNeeded,
          excess_kg: excessKg,
          status
        });
      });
    });

    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
