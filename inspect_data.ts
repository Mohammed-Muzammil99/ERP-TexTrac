import path from 'path';
import Database from 'better-sqlite3';
import { enrichAuditLogs } from './server/auditEnricher';

const DB_NAME = 'production_erp.db';
const rootDbPath = path.join(process.cwd(), DB_NAME);
const db = new Database(rootDbPath);

console.log("=== DB DIAGNOSTICS ===");

// 1. Audit Logs
try {
  const auditLogs = db.prepare(`
    SELECT a.*, u.username, u.full_name, u.role as user_role, u.department as user_department
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC 
    LIMIT 20
  `).all();
  console.log("\n--- ENRICHED AUDIT LOGS ---");
  const enriched = enrichAuditLogs(db, auditLogs);
  console.log(JSON.stringify(enriched, null, 2));
} catch (err: any) {
  console.error("Error reading audit logs:", err);
}

// 2. Locate any active product styles where successor > predecessor (deficit exists)
try {
  console.log("\n--- FINDING STYLES / SPECIFICATIONS WITH NEGATIVE BACKLOG (Successor > Predecessor) ---");
  const products = db.prepare(`
    SELECT p.id, p.po_number, p.style_num, p.color, p.size, p.qty as order_qty
    FROM po_products p
  `).all() as any[];

  let issuesCount = 0;
  for (const p of products) {
    const cut = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as total FROM cut_records WHERE product_id = ? AND status = 'accepted'`).get(p.id) as any;
    const send = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as total FROM send_records WHERE product_id = ? AND status = 'accepted'`).get(p.id) as any;
    const stitch = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as total FROM stitch_records WHERE product_id = ? AND status = 'accepted'`).get(p.id) as any;
    const finish = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as total FROM finish_records WHERE product_id = ? AND status = 'accepted' AND result = 'pass'`).get(p.id) as any;
    const blister = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'blister'`).get(p.id) as any;
    const carton = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as total FROM pack_records WHERE product_id = ? AND status = 'accepted' AND packing_type = 'carton'`).get(p.id) as any;

    const cutVal = cut.total;
    const sendVal = send.total;
    const stitchVal = stitch.total;
    const finishVal = finish.total;
    const blisterVal = blister.total;
    const cartonVal = carton.total;

    // Deficit checks:
    // Cut vs Sent (deficit if Sent > Cut)
    const cutVsSent = sendVal - cutVal;
    // Sent vs Stitched (deficit if Stitched > Sent)
    const sentVsStitch = stitchVal - sendVal;
    // Stitch vs Finipass (deficit if FinishPass > Stitch)
    const stitchVsFinish = finishVal - stitchVal;
    // FinishPass vs Blister (deficit if Blister > FinishPass)
    const finishVsBlister = blisterVal - finishVal;
    // Blister vs Carton (deficit if Carton > Blister)
    const blisterVsCarton = cartonVal - blisterVal;

    if (cutVsSent > 0 || sentVsStitch > 0 || stitchVsFinish > 0 || finishVsBlister > 0 || blisterVsCarton > 0) {
      issuesCount++;
      if (issuesCount <= 10) {
        console.log(`PO: ${p.po_number}, Spec: ${p.style_num} (${p.color} - ${p.size})`);
        console.log(`  Values: Cut=${cutVal}, Sent=${sendVal}, Stitch=${stitchVal}, FinishPass=${finishVal}, Blister=${blisterVal}, Carton=${cartonVal}`);
        console.log(`  Deficits: Sent-Cut=${cutVsSent}, Stitch-Sent=${sentVsStitch}, Finish-Stitch=${stitchVsFinish}, Blister-Finish=${finishVsBlister}, Carton-Blister=${blisterVsCarton}`);
      }
    }
  }
  console.log(`Total spec groups with negative pipeline transitions (successor > predecessor): ${issuesCount}`);
} catch (err: any) {
  console.error("Error diagnosing negatives:", err);
}

// 3. Check some UNALLOCATED stock records as well
try {
  const unallocatedCuts = db.prepare(`
    SELECT po_number, SUM(quantity) as total 
    FROM cut_records 
    WHERE po_number LIKE 'UNALLOCATED%'
    GROUP BY po_number
  `).all();
  console.log("\n--- UNALLOCATED CUTS IN DATABASE ---");
  console.log(unallocatedCuts);
} catch (err) {
  console.error("Error reading unallocated cuts:", err);
}

