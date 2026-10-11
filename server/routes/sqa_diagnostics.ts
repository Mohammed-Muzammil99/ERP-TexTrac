import { Router } from 'express';
import { db, logAudit } from '../db';
import { authenticateToken } from '../middleware';

const router = Router();

// Get the list of tables and their row counts
router.get('/sqa/tables', authenticateToken, (req, res) => {
  try {
    const list = [
      'users',
      'production_orders',
      'po_products',
      'cut_records',
      'send_records',
      'stitch_records',
      'finish_records',
      'pack_records',
      'return_records',
      'shipment_records',
      'fabric_records'
    ];

    const counts = list.map(tbl => {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM \`${tbl}\``).get() as any;
        return { table: tbl, count: row?.count || 0, exists: true };
      } catch (err) {
        return { table: tbl, count: 0, exists: false };
      }
    });

    res.json(counts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get rows from a specific table with optional filtering
router.get('/sqa/table-data', authenticateToken, (req, res) => {
  const { table, limit = 100 } = req.query;
  if (!table) return res.status(400).json({ error: 'Table parameter is required' });

  const allowedTables = [
    'users',
    'production_orders',
    'po_products',
    'cut_records',
    'send_records',
    'stitch_records',
    'finish_records',
    'pack_records',
    'return_records',
    'shipment_records',
    'fabric_records'
  ];

  if (!allowedTables.includes(String(table))) {
    return res.status(400).json({ error: `Table '${table}' query is not allowed for security reasons` });
  }

  try {
    const rows = db.prepare(`SELECT * FROM \`${table}\` ORDER BY id DESC LIMIT ?`).all(parseInt(String(limit))) as any[];
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SQA End-to-End Test Engine
router.post('/sqa/run-auto-test', authenticateToken, (req: any, res) => {
  const { keepTestData = false } = req.body;
  const logs: string[] = [];
  const startTimestamp = Date.now();
  const testId = Math.floor(1000 + Math.random() * 9000);
  const testPONumber = `SQA-TEST-PO-${testId}`;
  
  logs.push(`[SYSTEM] Starting Automated SQA Integration Test (ID: ${testId}).`);
  logs.push(`[SYSTEM] Target: Testing entire Finishing -> Packing -> Store Stock intake workflow.`);

  const stepExecutions: { step: string; success: boolean; details?: any }[] = [];

  try {
    db.transaction(() => {
      // -------------------------------------------------------------
      // STEP 1: Bootstrap Test PO & Product Specs
      // -------------------------------------------------------------
      logs.push(`[STEP 1] Provisioning test PO: "${testPONumber}".`);
      db.prepare(`
        INSERT INTO production_orders (po_number, buyer, priority, delivery_date, status, created_at)
        VALUES (?, 'SQA_CORP_TEST', 'Urgent', '2026-12-31', 'Active', CURRENT_TIMESTAMP)
      `).run(testPONumber);
      
      const insertProd = db.prepare(`
        INSERT INTO po_products (po_number, style_num, color, size, qty, unit_price, total_value)
        VALUES (?, 'SQA-99-STYLE', 'Jet Black', 'L', 120, 10.0, 1200.0)
      `);
      const prodResult = insertProd.run(testPONumber);
      const productId = prodResult.lastInsertRowid;
      
      logs.push(`[STEP 1] Created po_products. ID: ${productId}, Style: "SQA-99-STYLE", Qty Order: 120.`);
      stepExecutions.push({ step: 'PO_Creation', success: true, details: { po: testPONumber, product_id: productId } });

      // -------------------------------------------------------------
      // STEP 2: Pre-populate preceding departments to avoid negative balance issues
      // -------------------------------------------------------------
      logs.push(`[STEP 2] Inserting Cut records to begin the line.`);
      db.prepare(`
        INSERT INTO cut_records (po_number, product_id, quantity, status, created_by, created_at)
        VALUES (?, ?, 120, 'accepted', ?, CURRENT_TIMESTAMP)
      `).run(testPONumber, productId, req.user.id);

      db.prepare(`
        INSERT INTO send_records (po_number, product_id, quantity, line_number, status, created_by, created_at)
        VALUES (?, ?, 120, 'Line SQA', 'accepted', ?, CURRENT_TIMESTAMP)
      `).run(testPONumber, productId, req.user.id);

      db.prepare(`
        INSERT INTO stitch_records (po_number, product_id, quantity, line_number, status, created_by, created_at)
        VALUES (?, ?, 120, 'Line SQA', 'accepted', ?, CURRENT_TIMESTAMP)
      `).run(testPONumber, productId, req.user.id);
      
      logs.push(`[STEP 2] Preceded by 120 units in cut, feed, and stitch (fully accepted).`);
      stepExecutions.push({ step: 'Preceding_Staging', success: true });

      // -------------------------------------------------------------
      // STEP 3: Finishing Department QC Output
      // -------------------------------------------------------------
      logs.push(`[STEP 3] Simulating Quality Control in Finishing Dept.`);
      // Insert Passed finishing record in "pending" status, ready for Packing to review.
      db.prepare(`
        INSERT INTO finish_records (po_number, product_id, quantity, result, status, created_by, created_at)
        VALUES (?, ?, 120, 'pass', 'pending', ?, CURRENT_TIMESTAMP)
      `).run(testPONumber, productId, req.user.id);
      
      logs.push(`[STEP 3] Inserted 120 passed pieces into finish_records with status="pending".`);
      stepExecutions.push({ step: 'Finishing_QC_Pending', success: true });

      // -------------------------------------------------------------
      // STEP 4: Packing Handover Acceptance
      // -------------------------------------------------------------
      logs.push(`[STEP 4] Packing department receives notification about pending handover.`);
      
      // Query the pending ID
      const finishPending: any = db.prepare(`
        SELECT id, quantity FROM finish_records 
        WHERE product_id = ? AND status = 'pending' AND result = 'pass'
      `).get(productId);

      if (!finishPending) {
        throw new Error('Automated SQA Error: Could not retrieve drafted finish_records!');
      }

      logs.push(`[STEP 4] Packing accepts Handover ID ${finishPending.id} for ${finishPending.quantity} units.`);
      
      db.prepare(`
        UPDATE finish_records 
        SET status = 'accepted', received_by = ?, received_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.user.id, finishPending.id);

      logs.push(`[STEP 4] Handover Accepted. finish_records status converted to 'accepted'.`);
      stepExecutions.push({ step: 'Finishing_Handover_Accepted', success: true, details: { recordId: finishPending.id } });

      // -------------------------------------------------------------
      // STEP 5: Verify total_loose_available is exactly 120
      // -------------------------------------------------------------
      logs.push(`[STEP 5] Asserting that 120 units are now available for packing on the Packing Form.`);
      
      const checkLoose: any = db.prepare(`
        SELECT 
          (SELECT COALESCE(SUM(quantity), 0) FROM finish_records WHERE product_id = p.id AND result = 'pass' AND status = 'accepted') -
          (SELECT COALESCE(SUM(quantity), 0) FROM return_records WHERE product_id = p.id AND status = 'accepted' AND from_department = 'Packing') -
          (SELECT COALESCE(SUM(quantity), 0) FROM pack_records WHERE product_id = p.id AND packing_type = 'blister' AND status != 'rejected') as loose_avail
        FROM po_products p WHERE p.id = ?
      `).get(productId);

      const looseAvailable = checkLoose?.loose_avail || 0;
      logs.push(`[STEP 5] Calculated loose availability in database: ${looseAvailable} Pcs.`);
      
      if (looseAvailable !== 120) {
        throw new Error(`Assertion failed: Expected 120 loose pieces, found ${looseAvailable}`);
      }
      
      logs.push(`[STEP 5] Loose validation matched. 120 Pcs available. Success!`);
      stepExecutions.push({ step: 'Loose_Stock_Assertion', success: true, details: { looseAvailable } });

      // -------------------------------------------------------------
      // STEP 6: Pack from Loose to Blister
      // -------------------------------------------------------------
      logs.push(`[STEP 6] Packing 120 loose pieces into blisters (10 blisters of 12 counts = 120).`);
      
      db.prepare(`
        INSERT INTO pack_records (po_number, product_id, quantity, packing_type, status, store_status, created_by, created_at)
        VALUES (?, ?, 120, 'blister', 'accepted', 'pending', ?, CURRENT_TIMESTAMP)
      `).run(testPONumber, productId, 120, req.user.id);
      
      logs.push(`[STEP 6] Inserted pack_records with type='blister' and status='accepted'.`);
      stepExecutions.push({ step: 'Loose_To_Blister', success: true });

      // -------------------------------------------------------------
      // STEP 7: Pack Blister to Carton (Carton drafting)
      // -------------------------------------------------------------
      logs.push(`[STEP 7] Packing 120 blisters into 4 Cartons (30 pieces each).`);
      
      db.prepare(`
        INSERT INTO pack_records (po_number, product_id, quantity, cartons, packing_type, pcs_per_carton, status, store_status, created_by, created_at)
        VALUES (?, ?, 120, 4, 'carton', 30, 'pending', 'pending', ?, CURRENT_TIMESTAMP)
      `).run(testPONumber, productId, req.user.id);

      logs.push(`[STEP 7] Drafted 4 cartons (120 Pcs total) in pack_records with type='carton' (status='pending').`);
      stepExecutions.push({ step: 'Blister_To_Carton_Draft', success: true });

      // -------------------------------------------------------------
      // STEP 8: Verification / Acceptance of Carton QC
      // -------------------------------------------------------------
      logs.push(`[STEP 8] Simulating Packing internal Carton QC Acceptance.`);
      
      const cartonPending: any = db.prepare(`
        SELECT id, quantity FROM pack_records 
        WHERE product_id = ? AND packing_type = 'carton' AND status = 'pending'
      `).get(productId);

      if (!cartonPending) {
        throw new Error('Automated SQA Error: Could not locate drafted carton pack record.');
      }

      db.prepare(`
        UPDATE pack_records 
        SET status = 'accepted', received_by = ?, received_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.user.id, cartonPending.id);

      logs.push(`[STEP 8] Accepted Carton QC ID ${cartonPending.id}. Status changed to 'accepted'.`);
      stepExecutions.push({ step: 'Carton_QC_Accepted', success: true, details: { recordId: cartonPending.id } });

      // -------------------------------------------------------------
      // STEP 9: Transfer / Dispatch Cartons to Store
      // -------------------------------------------------------------
      logs.push(`[STEP 9] Dispatches cartons to Stock Store.`);
      
      db.prepare(`
        UPDATE pack_records
        SET store_status = 'in_transit'
        WHERE id = ?
      `).run(cartonPending.id);

      logs.push(`[STEP 9] Cartons status set to 'in_transit' for store intake.`);
      stepExecutions.push({ step: 'Transfer_To_Store', success: true });

      // -------------------------------------------------------------
      // STEP 10: Store intake confirmation
      // -------------------------------------------------------------
      logs.push(`[STEP 10] Store accepts incoming in_transit Carton ID ${cartonPending.id}.`);
      
      db.prepare(`
        UPDATE pack_records
        SET store_status = 'accepted', received_by = ?, received_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.user.id, cartonPending.id);

      logs.push(`[STEP 10] Store completed intake. store_status updated to 'accepted'.`);
      stepExecutions.push({ step: 'Store_Intake_Confirm', success: true });

      // -------------------------------------------------------------
      // STEP 11: Final balance verification
      // -------------------------------------------------------------
      logs.push(`[STEP 11] Performing final database inventory audit.`);
      
      const auditStore: any = db.prepare(`
        SELECT SUM(quantity) as accepted_packed_qty, SUM(cartons) as accepted_cartons 
        FROM pack_records 
        WHERE product_id = ? AND packing_type = 'carton' AND status = 'accepted' AND store_status = 'accepted'
      `).get(productId);

      logs.push(`[STEP 11] STOCK AUDIT SUMMARY:`);
      logs.push(`[STEP 11] >> Accepted Cartons in Store: ${auditStore?.accepted_cartons || 0}`);
      logs.push(`[STEP 11] >> Accepted Packed Pcs in Store: ${auditStore?.accepted_packed_qty || 0} Pcs.`);

      if (auditStore?.accepted_packed_qty !== 120 || auditStore?.accepted_cartons !== 4) {
        throw new Error(`Inventory reconciliation mismatch. Expected 120 pcs and 4 cartons, but found ${auditStore?.accepted_packed_qty} pcs and ${auditStore?.accepted_cartons} cartons!`);
      }

      logs.push(`[STEP 11] Integration assertion verified! All quantities perfectly reconciled in Stock Store.`);
      stepExecutions.push({ step: 'Inventory_Audit_Verify', success: true, details: { status: '100% Correct' } });

      // -------------------------------------------------------------
      // IF NOT KEEPING DATA, TEAR DOWN TO KEEP PRODUCTION TIDY
      // -------------------------------------------------------------
      if (!keepTestData) {
        logs.push(`[CLEANUP] Tearing down temporary SQA test suite entries to preserve database cleanliness.`);
        db.prepare(`DELETE FROM cut_records WHERE product_id = ?`).run(productId);
        db.prepare(`DELETE FROM send_records WHERE product_id = ?`).run(productId);
        db.prepare(`DELETE FROM stitch_records WHERE product_id = ?`).run(productId);
        db.prepare(`DELETE FROM finish_records WHERE product_id = ?`).run(productId);
        db.prepare(`DELETE FROM pack_records WHERE product_id = ?`).run(productId);
        db.prepare(`DELETE FROM po_products WHERE id = ?`).run(productId);
        db.prepare(`DELETE FROM production_orders WHERE po_number = ?`).run(testPONumber);
        logs.push(`[CLEANUP] Successfully cleaned up PO and all staging records.`);
      } else {
        logs.push(`[PERSISTENCE] keepTestData option active! SQA entries kept intact.`);
        logs.push(`[PERSISTENCE] Feel free to view purchase order: "${testPONumber}" in the normal ERP panels.`);
      }
    });

    const elapsed = Date.now() - startTimestamp;
    logs.push(`[SUCCESS] Automated SQA completed successfully in ${elapsed}ms.`);

    res.json({
      success: true,
      test_po: testPONumber,
      logs,
      steps: stepExecutions,
      duration: elapsed
    });

  } catch (err: any) {
    console.error('SQA AUTO-TEST EXCEPTION:', err);
    logs.push(`[CRITICAL ERROR] Test failed: ${err.message}`);
    res.status(400).json({
      success: false,
      test_po: testPONumber,
      logs,
      steps: stepExecutions,
      error: err.message
    });
  }
});

export default router;
