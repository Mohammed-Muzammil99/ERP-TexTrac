import path from 'path';
import Database from 'better-sqlite3';

const DB_NAME = 'production_erp.db';
const rootDbPath = path.join(process.cwd(), DB_NAME);
const db = new Database(rootDbPath);

try {
  const deleteLogs = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE (action LIKE '%DELETE%' OR action LIKE '%delete%')
    ORDER BY created_at DESC 
    LIMIT 10
  `).all();
  console.log("Recent DELETE audit logs:");
  console.log(JSON.stringify(deleteLogs, null, 2));

  const royalLogs = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE (new_value LIKE '%1252%' OR old_value LIKE '%1252%')
    ORDER BY created_at DESC 
    LIMIT 10
  `).all();
  console.log("Logs containing 1252:");
  console.log(JSON.stringify(royalLogs, null, 2));
} catch (err: any) {
  console.error("Error query:", err);
}

