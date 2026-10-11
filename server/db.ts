import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

// Database path logic for portable EXE
const DB_NAME = 'production_erp.db';
const BUNDLED_DB_PATH = path.join(__dirname, DB_NAME);
const rootDbPath = path.join(process.cwd(), DB_NAME);
const nearDbPath = path.join(__dirname, '..', DB_NAME);

let DB_PATH = rootDbPath;

if (process.env.DB_DATA_PATH) {
  // Use Electron's userData path if provided
  const dataDir = process.env.DB_DATA_PATH;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  DB_PATH = path.join(dataDir, DB_NAME);
  
  // If database doesn't exist in user data folder, copy the initial one from bundle
  if (!fs.existsSync(DB_PATH) && fs.existsSync(BUNDLED_DB_PATH)) {
    try {
      fs.copyFileSync(BUNDLED_DB_PATH, DB_PATH);
    } catch (e) {
      console.error('Failed to copy initial database:', e);
    }
  }
} else {
  // Resilient resolve for VS Code working directory shifts
  if (fs.existsSync(nearDbPath)) {
    DB_PATH = nearDbPath;
  } else {
    DB_PATH = rootDbPath;
  }
}

// Initialize Database safely with auto-recovery if corrupted
function initDatabase(dbPath: string): Database.Database {
  try {
    const instance = new Database(dbPath);
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
    // Verify integrity
    const check: any = instance.pragma('quick_check');
    if (Array.isArray(check) && check[0]?.quick_check !== 'ok') {
      throw new Error(`Integrity check failed: ${JSON.stringify(check)}`);
    }
    return instance;
  } catch (err: any) {
    console.error(`Database at ${dbPath} is corrupted or cannot be initialized:`, err);
    try {
      if (fs.existsSync(dbPath)) {
        const backupPath = `${dbPath}.corrupt.${Date.now()}`;
        fs.renameSync(dbPath, backupPath);
        if (fs.existsSync(`${dbPath}-wal`)) {
          try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
        }
        if (fs.existsSync(`${dbPath}-shm`)) {
          try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
        }
        console.warn(`Moved corrupt database to ${backupPath} and created a fresh database.`);
      }
    } catch (renameErr) {
      console.error('Failed to move corrupted database:', renameErr);
    }
    const freshInstance = new Database(dbPath);
    freshInstance.pragma('journal_mode = WAL');
    freshInstance.pragma('foreign_keys = ON');
    return freshInstance;
  }
}

export const db = initDatabase(DB_PATH);

try {
  db.exec("ALTER TABLE users ADD COLUMN allowed_pages TEXT;");
} catch (e) {
  // Column already exists or database table doesn't exist yet
}

try {
  db.exec("ALTER TABLE users ADD COLUMN allowed_departments TEXT;");
} catch (e) {
  // Column already exists or database table doesn't exist yet
}

try {
  db.exec("ALTER TABLE users ADD COLUMN can_change_time INTEGER DEFAULT 0;");
} catch (e) {
  // Column already exists or database table doesn't exist yet
}

try {
  db.exec("ALTER TABLE po_products ADD COLUMN delivery_date TEXT;");
} catch (e) {
  // Column already exists or database table doesn't exist yet
}

try {
  db.exec("ALTER TABLE audit_logs ADD COLUMN is_undone INTEGER DEFAULT 0;");
} catch (e) {
  // Column already exists or database table doesn't exist yet
}

try {
  db.exec("ALTER TABLE permission_requests ADD COLUMN requisition_data TEXT;");
} catch (e) {
  // Column already exists or database table doesn't exist yet
}

try {
  // Check if we need to migrate permission_requests to support old_stock_requisition
  const checkSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='permission_requests'").get() as any;
  if (checkSql && checkSql.sql && checkSql.sql.includes('CHECK(request_type IN') && !checkSql.sql.includes('old_stock_requisition')) {
    db.exec(`
      CREATE TABLE permission_requests_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        request_type TEXT NOT NULL,
        requested_items TEXT,
        requested_datetime TEXT,
        reason TEXT,
        status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        admin_notes TEXT,
        requisition_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(reviewed_by) REFERENCES users(id)
      );
      INSERT INTO permission_requests_new (id, user_id, request_type, requested_items, requested_datetime, reason, status, reviewed_by, reviewed_at, admin_notes, created_at)
      SELECT id, user_id, request_type, requested_items, requested_datetime, reason, status, reviewed_by, reviewed_at, admin_notes, created_at FROM permission_requests;
      DROP TABLE permission_requests;
      ALTER TABLE permission_requests_new RENAME TO permission_requests;
      CREATE INDEX IF NOT EXISTS idx_perm_requests_user ON permission_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_perm_requests_status ON permission_requests(status);
    `);
  }
} catch (e) {
  console.warn('Permission requests migration note:', e);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_approval_tokens (
    token TEXT PRIMARY KEY,
    request_id INTEGER NOT NULL,
    action TEXT CHECK(action IN ('approved', 'rejected')) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(request_id) REFERENCES permission_requests(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_wa_tokens_req ON whatsapp_approval_tokens(request_id);
`);

export const determineBuyerFromStyle = (styleNum: string): string => {
  if (!styleNum) return 'badger';
  const s = String(styleNum).trim();
  const numericVal = parseInt(s, 10);
  const is5000Series = (!isNaN(numericVal) && numericVal >= 5000 && numericVal <= 5999) || 
                       (/^\s*5\d{3,}\s*$/.test(s));
  return is5000Series ? 'C2' : 'badger';
};

export const determineBuyersFromProducts = (products: any[], explicitBuyer?: string): string => {
  if (explicitBuyer && explicitBuyer.trim()) {
    return explicitBuyer.trim();
  }
  if (!products || products.length === 0) return 'badger';
  const buyersSet = new Set<string>();
  products.forEach((p: any) => {
    if (p) {
      if (p.buyer && String(p.buyer).trim()) {
        buyersSet.add(String(p.buyer).trim());
      } else {
        const style = String(p.style_num || '').trim();
        if (style) {
          buyersSet.add(determineBuyerFromStyle(style));
        }
      }
    }
  });
  if (buyersSet.size === 0) return 'badger';
  return Array.from(buyersSet).sort().join(', ');
};

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'supervisor', 'operator', 'viewer')) NOT NULL,
    department TEXT DEFAULT 'Admin',
    allowed_pages TEXT,
    allowed_departments TEXT,
    can_change_time INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS production_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    buyer TEXT,
    season TEXT,
    floor TEXT,
    delivery_date TEXT,
    priority TEXT CHECK(priority IN ('Normal', 'Urgent', 'Low')) DEFAULT 'Normal',
    status TEXT CHECK(status IN ('Active', 'Draft', 'On Hold', 'On Review', 'Closed')) DEFAULT 'Active',
    remarks TEXT,
    total_qty INTEGER DEFAULT 0,
    total_value REAL DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO system_settings (key, value) VALUES ('working_date', datetime('now', 'localtime', 'start of day'));

  CREATE TABLE IF NOT EXISTS po_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    line_num TEXT,
    style_num TEXT,
    item_num TEXT,
    description TEXT,
    color TEXT,
    size TEXT,
    size_ratio TEXT,
    qty INTEGER DEFAULT 0,
    unit_price REAL DEFAULT 0,
    total_value REAL DEFAULT 0,
    fabric_type TEXT,
    gsm TEXT,
    country TEXT,
    ship_mode TEXT,
    priority TEXT DEFAULT 'Normal',
    delivery_date TEXT,
    custom_data TEXT, -- JSON string
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(po_number) REFERENCES production_orders(po_number) ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    col_type TEXT CHECK(col_type IN ('text', 'number', 'date')) DEFAULT 'text',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cut_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE,
    FOREIGN KEY(received_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS cutting_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    planned_qty INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS send_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    line_number TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE,
    FOREIGN KEY(received_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS stitch_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    line_number TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE,
    FOREIGN KEY(received_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS finish_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    result TEXT CHECK(result IN ('pass', 'reject')) NOT NULL,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    is_direct_carton INTEGER DEFAULT 0,
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE,
    FOREIGN KEY(received_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pack_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    cartons INTEGER,
    packing_type TEXT CHECK(packing_type IN ('loose', 'blister', 'carton')) DEFAULT 'loose',
    pcs_per_carton INTEGER,
    is_direct_carton INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    store_status TEXT CHECK(store_status IN ('pending', 'in_transit', 'accepted', 'rejected')) DEFAULT 'pending',
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE,
    FOREIGN KEY(received_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fabric_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fabric_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    style_num TEXT,
    batch_id TEXT,
    fabric_name TEXT,
    gsm INTEGER,
    record_type TEXT CHECK(record_type IN ('inhouse', 'issue', 'return', 'consumption')) NOT NULL,
    color TEXT,
    quantity_kg REAL NOT NULL,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(po_number) REFERENCES production_orders(po_number) ON DELETE CASCADE,
    FOREIGN KEY(received_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS shipment_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    sscc TEXT,
    item_num TEXT,
    line_num TEXT,
    color TEXT,
    size TEXT,
    pieces_per_carton INTEGER,
    cartons INTEGER,
    quantity INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS return_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    from_department TEXT NOT NULL,
    to_department TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    received_by INTEGER,
    received_at DATETIME,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id),
    FOREIGN KEY(received_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS permission_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    request_type TEXT CHECK(request_type IN ('dept_access', 'page_access', 'datetime_change', 'old_stock_requisition')) NOT NULL,
    requested_items TEXT,
    requested_datetime TEXT,
    reason TEXT,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    admin_notes TEXT,
    requisition_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(reviewed_by) REFERENCES users(id)
  );

  -- Performance Indexes
  CREATE INDEX IF NOT EXISTS idx_po_products_po_number ON po_products(po_number);
  CREATE INDEX IF NOT EXISTS idx_po_products_style_num ON po_products(style_num);
  CREATE INDEX IF NOT EXISTS idx_perm_requests_user ON permission_requests(user_id);
  CREATE INDEX IF NOT EXISTS idx_perm_requests_status ON permission_requests(status);
  
  CREATE INDEX IF NOT EXISTS idx_cut_records_product_id ON cut_records(product_id);
  CREATE INDEX IF NOT EXISTS idx_cut_records_status ON cut_records(status);
  
  CREATE INDEX IF NOT EXISTS idx_send_records_product_id ON send_records(product_id);
  CREATE INDEX IF NOT EXISTS idx_send_records_status ON send_records(status);
  
  CREATE INDEX IF NOT EXISTS idx_stitch_records_product_id ON stitch_records(product_id);
  CREATE INDEX IF NOT EXISTS idx_stitch_records_status ON stitch_records(status);
  
  CREATE INDEX IF NOT EXISTS idx_finish_records_product_id ON finish_records(product_id);
  CREATE INDEX IF NOT EXISTS idx_finish_records_status ON finish_records(status);
  
  CREATE INDEX IF NOT EXISTS idx_pack_records_product_id ON pack_records(product_id);
  CREATE INDEX IF NOT EXISTS idx_pack_records_status ON pack_records(status);
  
  CREATE INDEX IF NOT EXISTS idx_fabric_records_po_number ON fabric_records(po_number);
  CREATE INDEX IF NOT EXISTS idx_fabric_records_status ON fabric_records(status);

  CREATE INDEX IF NOT EXISTS idx_return_records_product_id ON return_records(product_id);
  CREATE INDEX IF NOT EXISTS idx_return_records_to_dept ON return_records(to_department);
  CREATE INDEX IF NOT EXISTS idx_return_records_status ON return_records(status);

  -- Archived/Historical Tables and Summaries
  CREATE TABLE IF NOT EXISTS archived_po_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    style_num TEXT,
    color TEXT,
    size TEXT,
    order_qty INTEGER DEFAULT 0,
    total_cut INTEGER DEFAULT 0,
    total_sent INTEGER DEFAULT 0,
    total_stitched INTEGER DEFAULT 0,
    total_finished_passed INTEGER DEFAULT 0,
    total_finished_rejected INTEGER DEFAULT 0,
    total_packed_loose INTEGER DEFAULT 0,
    total_packed_blister INTEGER DEFAULT 0,
    total_packed_carton INTEGER DEFAULT 0,
    total_packed_carton_count INTEGER DEFAULT 0,
    total_shipped INTEGER DEFAULT 0,
    total_returns INTEGER DEFAULT 0,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_archived_po_summaries_po ON archived_po_summaries(po_number);

  CREATE TABLE IF NOT EXISTS archive_cut_records (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    status TEXT,
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_archive_cut_records_po ON archive_cut_records(po_number);

  CREATE TABLE IF NOT EXISTS archive_send_records (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    line_number TEXT NOT NULL,
    status TEXT,
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_archive_send_records_po ON archive_send_records(po_number);

  CREATE TABLE IF NOT EXISTS archive_stitch_records (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    line_number TEXT NOT NULL,
    status TEXT,
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_archive_stitch_records_po ON archive_stitch_records(po_number);

  CREATE TABLE IF NOT EXISTS archive_finish_records (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    result TEXT,
    status TEXT,
    is_direct_carton INTEGER DEFAULT 0,
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_archive_finish_records_po ON archive_finish_records(po_number);

  CREATE TABLE IF NOT EXISTS archive_pack_records (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    cartons INTEGER,
    packing_type TEXT,
    pcs_per_carton INTEGER,
    is_direct_carton INTEGER DEFAULT 0,
    status TEXT,
    store_status TEXT,
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_archive_pack_records_po ON archive_pack_records(po_number);

  CREATE TABLE IF NOT EXISTS archive_return_records (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    from_department TEXT NOT NULL,
    to_department TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    status TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    received_by INTEGER,
    received_at DATETIME
  );

  CREATE INDEX IF NOT EXISTS idx_archive_return_records_po ON archive_return_records(po_number);

  CREATE TABLE IF NOT EXISTS archive_fabric_records (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    style_num TEXT,
    batch_id TEXT,
    fabric_name TEXT,
    gsm INTEGER,
    record_type TEXT NOT NULL,
    color TEXT,
    quantity_kg REAL NOT NULL,
    status TEXT,
    received_by INTEGER,
    received_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_archive_fabric_records_po ON archive_fabric_records(po_number);

  CREATE TABLE IF NOT EXISTS archive_cutting_programs (
    id INTEGER PRIMARY KEY,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    planned_qty INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_archive_cutting_programs_po ON archive_cutting_programs(po_number);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL, -- e.g., 'CREATE', 'UPDATE', 'DELETE'
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_value TEXT, -- JSON string
    new_value TEXT, -- JSON string
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_undone INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_system INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);

  CREATE TABLE IF NOT EXISTS custom_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_name TEXT NOT NULL,
    department_name TEXT NOT NULL,
    schema_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS custom_form_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL,
    data_json TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(form_id) REFERENCES custom_forms(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_custom_forms_dept ON custom_forms(department_name);
  CREATE INDEX IF NOT EXISTS idx_custom_form_data_form ON custom_form_data(form_id);

  CREATE TABLE IF NOT EXISTS buyer_gsm_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer TEXT NOT NULL,
    fabric_type TEXT NOT NULL,
    gsm INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(buyer, fabric_type)
  );
  CREATE INDEX IF NOT EXISTS idx_buyer_gsm_rules_buyer ON buyer_gsm_rules(buyer);

  CREATE TABLE IF NOT EXISTS press_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pcs_pressed INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_press_records_created_at ON press_records(created_at);

  CREATE TABLE IF NOT EXISTS style_consumption_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    style_num TEXT NOT NULL,
    fabric_type TEXT NOT NULL,
    expected_consumption REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(style_num, fabric_type)
  );
  CREATE INDEX IF NOT EXISTS idx_style_consumption_rates_style ON style_consumption_rates(style_num);
`);

// Seed default rules for Badger + Fleece and C2 + Fleece if not exists
try {
  db.prepare(`
    INSERT OR IGNORE INTO buyer_gsm_rules (buyer, fabric_type, gsm)
    VALUES (?, ?, ?)
  `).run('BADGER', 'FLEECE', 315);
  db.prepare(`
    INSERT OR IGNORE INTO buyer_gsm_rules (buyer, fabric_type, gsm)
    VALUES (?, ?, ?)
  `).run('C2', 'FLEECE', 270);
} catch (e) {
  console.error('Failed to seed buyer_gsm_rules:', e);
}

// Migration Helper: Add columns if missing
const addColumnIfMissing = (table: string, column: string, definition: string) => {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!info.find((c: any) => c.name === column)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (e) {
      console.log(`Failed to add column ${column} to ${table}:`, e);
    }
  }
};

addColumnIfMissing('users', 'department', "TEXT DEFAULT 'Admin'");
addColumnIfMissing('users', 'allowed_pages', 'TEXT');
addColumnIfMissing('users', 'allowed_departments', 'TEXT');
addColumnIfMissing('users', 'can_change_time', 'INTEGER DEFAULT 0');
addColumnIfMissing('po_products', 'delivery_date', 'TEXT');
addColumnIfMissing('audit_logs', 'is_undone', 'INTEGER DEFAULT 0');
addColumnIfMissing('permission_requests', 'requisition_data', 'TEXT');
addColumnIfMissing('cut_records', 'status', "TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending'");
addColumnIfMissing('cut_records', 'received_by', 'INTEGER');
addColumnIfMissing('cut_records', 'received_at', 'DATETIME');

addColumnIfMissing('send_records', 'status', "TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending'");
addColumnIfMissing('send_records', 'received_by', 'INTEGER');
addColumnIfMissing('send_records', 'received_at', 'DATETIME');

addColumnIfMissing('stitch_records', 'status', "TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending'");
addColumnIfMissing('stitch_records', 'received_by', 'INTEGER');
addColumnIfMissing('stitch_records', 'received_at', 'DATETIME');

addColumnIfMissing('pack_records', 'status', "TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending'");
addColumnIfMissing('pack_records', 'store_status', "TEXT CHECK(store_status IN ('pending', 'in_transit', 'accepted', 'rejected')) DEFAULT 'pending'");
addColumnIfMissing('pack_records', 'received_by', 'INTEGER');
addColumnIfMissing('pack_records', 'received_at', 'DATETIME');
addColumnIfMissing('pack_records', 'packing_type', "TEXT CHECK(packing_type IN ('loose', 'blister', 'carton')) DEFAULT 'loose'");
addColumnIfMissing('pack_records', 'pcs_per_carton', 'INTEGER');
addColumnIfMissing('pack_records', 'is_direct_carton', 'INTEGER DEFAULT 0');
addColumnIfMissing('archive_pack_records', 'is_direct_carton', 'INTEGER DEFAULT 0');

addColumnIfMissing('finish_records', 'status', "TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending'");
addColumnIfMissing('finish_records', 'is_direct_carton', 'INTEGER DEFAULT 0');
addColumnIfMissing('archive_finish_records', 'is_direct_carton', 'INTEGER DEFAULT 0');
addColumnIfMissing('finish_records', 'received_by', 'INTEGER');
addColumnIfMissing('finish_records', 'received_at', 'DATETIME');

addColumnIfMissing('fabric_records', 'status', "TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending'");
addColumnIfMissing('fabric_records', 'received_by', 'INTEGER');
addColumnIfMissing('fabric_records', 'received_at', 'DATETIME');

addColumnIfMissing('cut_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('send_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('stitch_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('finish_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('pack_records', 'is_old_stock', 'INTEGER DEFAULT 0');

addColumnIfMissing('style_consumption_rates', 'greige_consumption', 'REAL DEFAULT 0');
addColumnIfMissing('style_consumption_rates', 'process_loss_pct', 'REAL DEFAULT 0');

try {
  db.exec(`
    UPDATE style_consumption_rates 
    SET greige_consumption = expected_consumption 
    WHERE (greige_consumption IS NULL OR greige_consumption = 0) AND expected_consumption > 0
  `);
} catch (e) {
  console.error('Failed to backfill greige_consumption:', e);
}

// Create discard_records table
db.exec(`
  CREATE TABLE IF NOT EXISTS discard_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    department TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );
`);

// Create stitching_line_configs table
db.exec(`
  CREATE TABLE IF NOT EXISTS stitching_line_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    line_number TEXT NOT NULL,
    seated_operators INTEGER DEFAULT 20,
    target_hourly_benchmark INTEGER DEFAULT 150,
    UNIQUE(date, line_number)
  );
`);


addColumnIfMissing('archive_cut_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('archive_send_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('archive_stitch_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('archive_finish_records', 'is_old_stock', 'INTEGER DEFAULT 0');
addColumnIfMissing('archive_pack_records', 'is_old_stock', 'INTEGER DEFAULT 0');

addColumnIfMissing('po_products', 'priority', "TEXT DEFAULT 'Normal'");
addColumnIfMissing('po_products', 'est_date', 'TEXT');
addColumnIfMissing('fabric_records', 'style_num', 'TEXT');
addColumnIfMissing('archived_po_summaries', 'total_packed_carton_count', 'INTEGER DEFAULT 0');
addColumnIfMissing('return_records', 'line_number', 'TEXT');
addColumnIfMissing('archive_return_records', 'line_number', 'TEXT');

try {
  const nullReturns: any[] = db.prepare("SELECT * FROM return_records WHERE (line_number IS NULL OR line_number = '') AND from_department IN ('Stitching', 'Finishing')").all();
  for (const r of nullReturns) {
    const sendRecs: any[] = db.prepare("SELECT DISTINCT line_number FROM send_records WHERE product_id = ? AND line_number IS NOT NULL AND line_number != ''").all(r.product_id);
    if (sendRecs.length === 1) {
      db.prepare("UPDATE return_records SET line_number = ? WHERE id = ?").run(sendRecs[0].line_number, r.id);
    } else if (sendRecs.length > 1) {
      const activeSend: any = db.prepare("SELECT line_number FROM send_records WHERE product_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT 1").get(r.product_id, r.created_at);
      if (activeSend?.line_number) {
        db.prepare("UPDATE return_records SET line_number = ? WHERE id = ?").run(activeSend.line_number, r.id);
      } else {
        db.prepare("UPDATE return_records SET line_number = ? WHERE id = ?").run(sendRecs[0].line_number, r.id);
      }
    }
  }
} catch (e) {
  console.error('Failed to backfill return_records line_number:', e);
}

// Migrate fabric_records check constraint if needed
const fabricRecordsSchema: any = db.prepare("SELECT sql FROM sqlite_master WHERE name='fabric_records' AND type='table'").get();
if (fabricRecordsSchema && (!fabricRecordsSchema.sql.includes("fabric_name") || !fabricRecordsSchema.sql.includes("gsm"))) {
  console.log('Migrating fabric_records table to include "fabric_name" and "gsm" columns...');
  try {
    db.transaction(() => {
      // 1. Rename existing table
      db.exec("ALTER TABLE fabric_records RENAME TO fabric_records_old");
      
      // 2. Create new table with updated columns
      db.exec(`
        CREATE TABLE fabric_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          po_number TEXT NOT NULL,
          style_num TEXT,
          batch_id TEXT,
          fabric_name TEXT,
          gsm INTEGER,
          record_type TEXT CHECK(record_type IN ('inhouse', 'issue', 'return', 'consumption')) NOT NULL,
          color TEXT,
          quantity_kg REAL NOT NULL,
          status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
          received_by INTEGER,
          received_at DATETIME,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(po_number) REFERENCES production_orders(po_number) ON DELETE CASCADE,
          FOREIGN KEY(received_by) REFERENCES users(id)
        )
      `);
      
      // 3. Copy data
      const oldCols = db.prepare("PRAGMA table_info(fabric_records_old)").all().map((c: any) => c.name);
      const targetCols = ['id', 'po_number', 'style_num', 'batch_id', 'fabric_name', 'gsm', 'record_type', 'color', 'quantity_kg', 'status', 'received_by', 'received_at', 'created_by', 'created_at'];
      const sharedCols = targetCols.filter(c => oldCols.includes(c));
      const colsStr = sharedCols.join(', ');
      
      db.exec(`INSERT INTO fabric_records (${colsStr}) SELECT ${colsStr} FROM fabric_records_old`);
      
      // 4. Drop old table
      db.exec("DROP TABLE fabric_records_old");
    })();
    console.log('fabric_records migration successful');
  } catch (e) {
    console.error('fabric_records migration failed:', e);
  }
}

// Migrate cutting_programs to remove unique constraint
const cpSchema: any = db.prepare("SELECT sql FROM sqlite_master WHERE name='cutting_programs' AND type='table'").get();
if (cpSchema && cpSchema.sql.includes("UNIQUE")) {
  console.log('Migrating cutting_programs table to remove UNIQUE constraint...');
  try {
    db.transaction(() => {
      db.exec("ALTER TABLE cutting_programs RENAME TO cutting_programs_old");
      db.exec(`
        CREATE TABLE cutting_programs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          po_number TEXT NOT NULL,
          product_id INTEGER NOT NULL,
          planned_qty INTEGER NOT NULL,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(product_id) REFERENCES po_products(id) ON DELETE CASCADE
        )
      `);
      db.exec("INSERT INTO cutting_programs (id, po_number, product_id, planned_qty, created_by, created_at) SELECT id, po_number, product_id, planned_qty, created_by, created_at FROM cutting_programs_old");
      db.exec("DROP TABLE cutting_programs_old");
    })();
    console.log('cutting_programs migration successful');
  } catch (e) {
    console.error('cutting_programs migration failed:', e);
  }
}

// Seed Universal PO for non-specific fabric records
const universalPOExists = db.prepare('SELECT id FROM production_orders WHERE po_number = ?').get('UNIVERSAL');
if (!universalPOExists) {
  db.prepare(`
    INSERT INTO production_orders (po_number, buyer, season, floor, status, remarks, total_qty, total_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('UNIVERSAL', 'GLOBAL', 'N/A', 'N/A', 'Active', 'Virtual PO for unassigned fabric stock', 0, 0);
}

// Seed UNALLOCATED PO for unallocated cutting and WIP stock holding pool
const unallocatedPOExists = db.prepare('SELECT id FROM production_orders WHERE po_number = ?').get('UNALLOCATED');
if (!unallocatedPOExists) {
  db.prepare(`
    INSERT INTO production_orders (po_number, buyer, season, floor, status, remarks, total_qty, total_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('UNALLOCATED', 'HOLDING_POOL', 'N/A', 'N/A', 'Active', 'Virtual PO for unallocated stock holding pool', 0, 0);
}

// Seed Admin User if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, full_name, hashed_password, role) VALUES (?, ?, ?, ?)').run(
    'admin', 'System Administrator', hashedPassword, 'admin'
  );
}

// Seed Universal Supervisor if not exists
const supervisorExists = db.prepare('SELECT id FROM users WHERE username = ?').get('supervisor');
if (!supervisorExists) {
  const hashedPassword = bcrypt.hashSync('super123', 10);
  db.prepare('INSERT INTO users (username, full_name, hashed_password, role, department) VALUES (?, ?, ?, ?, ?)').run(
    'supervisor', 'Universal Supervisor', hashedPassword, 'supervisor', 'All'
  );
}

// Seed Default Departments if table is empty or missing standard ones
const seedSystemDepartments = () => {
  const stdDepts = ['Admin', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Shipping', 'Quality'];
  const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name, is_system) VALUES (?, 1)');
  db.transaction(() => {
    stdDepts.forEach(d => {
      insertDept.run(d);
    });
  })();
};
try {
  seedSystemDepartments();
} catch (e) {
  console.error('Failed to seed standard departments', e);
}

// Seed Default Fabric Types if table is empty
const fabricTypeCount = (db.prepare('SELECT COUNT(*) as count FROM fabric_types').get() as any).count;
if (fabricTypeCount === 0) {
  const defaultFabricTypes = ['S.Jersey', 'Fleece', 'Rib', 'Interlock', 'Pique'];
  const insertFabricType = db.prepare('INSERT INTO fabric_types (name) VALUES (?)');
  db.transaction(() => {
    defaultFabricTypes.forEach((f) => {
      insertFabricType.run(f);
    });
  })();
}

// One-time startup sync for style-number-based buyers (preserves explicit buyers)
try {
  const allPOs = db.prepare('SELECT po_number, buyer FROM production_orders WHERE po_number != ?').all('UNIVERSAL') as { po_number: string, buyer: string }[];
  db.transaction(() => {
    allPOs.forEach((po) => {
      if (!po.buyer || !po.buyer.trim()) {
        const products = db.prepare('SELECT style_num, buyer FROM po_products WHERE po_number = ?').all(po.po_number);
        const computedBuyer = determineBuyersFromProducts(products);
        db.prepare('UPDATE production_orders SET buyer = ? WHERE po_number = ?').run(computedBuyer, po.po_number);
      }
    });
  })();
  console.log('Successfully synced/migrated PO buyers');
} catch (e) {
  console.error('Failed to sync PO buyers on startup:', e);
}

// One-time migration for existing data to trigger handover
try {
  db.exec(`
    UPDATE finish_records 
    SET status = 'pending' 
    WHERE status IS NULL AND result = 'pass';
  `);
} catch (e) {
  console.log('Skipping initial handover migration');
}

// Inhouse and consumption fabric records have no receiver department, so they should be 'accepted' automatically.
try {
  db.exec(`
    UPDATE fabric_records
    SET status = 'accepted'
    WHERE record_type IN ('inhouse', 'consumption') AND status != 'accepted';
  `);
  console.log('Successfully auto-accepted inhouse and consumption fabric records');
} catch (e) {
  console.error('Failed to auto-accept fabric records on startup:', e);
}

export const COLOR_MAP: Record<string, string> = {
  'BK': 'BLACK',
  'WH': 'WHITE',
  'GY': 'GREY',
  'RD': 'RED',
  'BL': 'BLUE',
  'GN': 'GREEN',
  'YL': 'YELLOW',
  'OR': 'ORANGE',
  'PR': 'PURPLE',
  'BN': 'BROWN',
  'OX': 'OXFORD',
  'RY': 'ROYAL',
  'NV': 'NAVY',
  'CR': 'CHARCOAL',
  'CH': 'CHARCOAL',
  'PK': 'PINK',
  'TQ': 'TURQUOISE',
  'BG': 'BURGUNDY',
  'GR': 'GRAPHITE',
  'OL': 'OLIVE',
  'LM': 'LIME',
  'MA': 'MAROON',
  'HTR': 'HEATHER',
  'PU': 'PURPLE',
  'FS': 'FOREST',
  'BO': 'BURNT ORANGE',
  'NY': 'NAVY',
  'KY': 'KELLY GREEN',
  'SFYW': 'SAFETY YELLOW',
  'VG': 'VEGAS GOLD',
  'GD': 'GOLD',
  'CB': 'COLUMBIA BLUE',
  'BR': 'BROWN',
  'MI': 'MILITARY',
  'ASH': 'ASH',
  'CARDINAL': 'CARDINAL'
};

export const normalizeToFullForm = (color: string): string => {
  if (!color) return '';
  let processed = color.toUpperCase().trim();
  if (processed.startsWith('FSG ')) {
    processed = processed.substring(4).trim();
  }

  // Heal previously mis-split compound single colors that were stored with slashes
  const compoundFixes: Record<string, string> = {
    'LT/GREY/HEATHER': 'LT GREY HEATHER',
    'LIGHT/GREY/HEATHER': 'LIGHT GREY HEATHER',
    'LT/GY/HTR': 'LT GREY HEATHER',
    'LT/GREY/HTR': 'LT GREY HEATHER',
    'DEEP/FOREST': 'DEEP FOREST',
    'BURNT/ORANGE': 'BURNT ORANGE',
    'SAFETY/YELLOW': 'SAFETY YELLOW',
    'VEGAS/GOLD': 'VEGAS GOLD',
    'COLUMBIA/BLUE': 'COLUMBIA BLUE',
    'KELLY/GREEN': 'KELLY GREEN',
    'DARK/GREEN': 'DARK GREEN',
    'LIGHT/BLUE': 'LIGHT BLUE',
    'CHARCOAL/HEATHER': 'CHARCOAL HEATHER',
    'ROYAL/HEATHER': 'ROYAL HEATHER',
    'NAVY/HEATHER': 'NAVY HEATHER',
    'RED/HEATHER': 'RED HEATHER',
    'BLACK/HEATHER': 'BLACK HEATHER',
    'GREY/HEATHER': 'GREY HEATHER',
    'HEATHER/GREY': 'HEATHER GREY',
    'OXFORD/GREY': 'OXFORD GREY'
  };

  for (const [badPattern, fixedPattern] of Object.entries(compoundFixes)) {
    if (processed.includes(badPattern)) {
      processed = processed.replace(new RegExp(badPattern.replace(/\//g, '\\/'), 'g'), fixedPattern);
    }
  }

  // Only split on explicit slashes ('/') or plus signs ('+'), NEVER on whitespace
  const parts = processed.split(/[\/\+]+/).map(p => p.trim()).filter(Boolean);
  const mappedParts = parts.map(segment => {
    // 1. If whole segment matches a color alias (e.g. 'BK' -> 'BLACK', 'BO' -> 'BURNT ORANGE')
    if (COLOR_MAP[segment]) {
      return COLOR_MAP[segment];
    }
    // 2. If segment has space-separated words (e.g. 'LT GREY HTR'), expand individual abbreviations
    const words = segment.split(/\s+/).filter(Boolean);
    const mappedWords = words.map(w => COLOR_MAP[w] || w);
    return mappedWords.join(' ');
  });

  return mappedParts.join('/');
};

export const getUnifiedColor = (uploadedColor: string, existingColors: string[]): string => {
  const fullForm = normalizeToFullForm(uploadedColor);
  const match = existingColors.find(c => String(c).toUpperCase().trim() === fullForm.toUpperCase().trim());
  if (match) return match;
  return fullForm;
};

// One-time color normalization migration to convert short/abbreviated form colors to full-form canonical names
try {
  db.transaction(() => {
    // 1. po_products
    const products = db.prepare("SELECT id, color FROM po_products WHERE color IS NOT NULL AND color != ''").all() as { id: number, color: string }[];
    const updateProduct = db.prepare('UPDATE po_products SET color = ? WHERE id = ?');
    for (const p of products) {
      const fullForm = normalizeToFullForm(p.color);
      if (fullForm !== p.color) {
        updateProduct.run(fullForm, p.id);
      }
    }

    // 2. fabric_records
    const fabricRecords = db.prepare("SELECT id, color FROM fabric_records WHERE color IS NOT NULL AND color != ''").all() as { id: number, color: string }[];
    const updateFabric = db.prepare('UPDATE fabric_records SET color = ? WHERE id = ?');
    for (const f of fabricRecords) {
      const fullForm = normalizeToFullForm(f.color);
      if (fullForm !== f.color) {
        updateFabric.run(fullForm, f.id);
      }
    }

    // 3. shipment_records
    const shipmentRecords = db.prepare("SELECT id, color FROM shipment_records WHERE color IS NOT NULL AND color != ''").all() as { id: number, color: string }[];
    const updateShipment = db.prepare('UPDATE shipment_records SET color = ? WHERE id = ?');
    for (const s of shipmentRecords) {
      const fullForm = normalizeToFullForm(s.color);
      if (fullForm !== s.color) {
        updateShipment.run(fullForm, s.id);
      }
    }

    // 4. archived_po_summaries
    const archiveRecords = db.prepare("SELECT id, color FROM archived_po_summaries WHERE color IS NOT NULL AND color != ''").all() as { id: number, color: string }[];
    const updateArchive = db.prepare('UPDATE archived_po_summaries SET color = ? WHERE id = ?');
    for (const a of archiveRecords) {
      const fullForm = normalizeToFullForm(a.color);
      if (fullForm !== a.color) {
        updateArchive.run(fullForm, a.id);
      }
    }

    // 5. colors table normalization and deduplication
    try {
      const colorsTable = db.prepare("SELECT id, name FROM colors WHERE name IS NOT NULL AND name != ''").all() as { id: number, name: string }[];
      const updateColorRow = db.prepare('UPDATE colors SET name = ? WHERE id = ?');
      const deleteColorRow = db.prepare('DELETE FROM colors WHERE id = ?');
      const seenColors = new Set<string>();
      for (const c of colorsTable) {
        const fullForm = normalizeToFullForm(c.name);
        const upperFullForm = fullForm.toUpperCase().trim();
        if (seenColors.has(upperFullForm)) {
          deleteColorRow.run(c.id);
        } else {
          seenColors.add(upperFullForm);
          if (fullForm !== c.name) {
            updateColorRow.run(fullForm, c.id);
          }
        }
      }
    } catch (colorsErr) {
      // Table might not exist yet or empty
    }

    // Deduplicate duplicate rows in po_products if they end up having identical (po_number, style_num, color, size)
    const allProds = db.prepare('SELECT id, po_number, style_num, color, size, qty FROM po_products').all() as any[];
    const prodMap = new Map<string, any>();
    const dupesToMerge: { keepId: number, deleteId: number, qtyToAdd: number }[] = [];

    for (const p of allProds) {
      const key = `${String(p.po_number).toUpperCase().trim()}||${String(p.style_num).toUpperCase().trim()}||${String(p.color).toUpperCase().trim()}||${String(p.size).toUpperCase().trim()}`;
      if (prodMap.has(key)) {
        const existing = prodMap.get(key);
        dupesToMerge.push({
          keepId: existing.id,
          deleteId: p.id,
          qtyToAdd: p.qty || 0
        });
        existing.qty = (existing.qty || 0) + (p.qty || 0);
      } else {
        prodMap.set(key, p);
      }
    }

    if (dupesToMerge.length > 0) {
      console.log(`Found ${dupesToMerge.length} duplicate product rows to merge after color normalization...`);
      const tablesToUpdate = [
        'cut_records', 'send_records', 'stitch_records', 
        'finish_records', 'pack_records', 'shipment_records',
        'return_records', 'cutting_programs', 'archived_po_summaries',
        'archive_cut_records', 'archive_send_records', 'archive_stitch_records',
        'archive_finish_records', 'archive_pack_records', 'archive_return_records',
        'archive_shipment_records'
      ];
      
      for (const dupe of dupesToMerge) {
        for (const tbl of tablesToUpdate) {
          try {
            db.prepare(`UPDATE \`${tbl}\` SET product_id = ? WHERE product_id = ?`).run(dupe.keepId, dupe.deleteId);
          } catch (err) {
            // Ignore if table does not exist
          }
        }
        db.prepare('UPDATE po_products SET qty = qty + ? WHERE id = ?').run(dupe.qtyToAdd, dupe.keepId);
        db.prepare('DELETE FROM po_products WHERE id = ?').run(dupe.deleteId);
      }
      console.log('Successfully merged all duplicate po_products records.');
    }
  })();
  console.log('Successfully completed color normalization migration to full form everywhere');
} catch (e) {
  console.error('Failed to migrate colors to full form on startup:', e);
}

export const logAudit = (userId: number, action: string, tableName: string, recordId: string | number, oldValue: any = null, newValue: any = null, ip: string = '') => {
  try {
    // Audit logs ALWAYS record actual real-world timestamp (ISO UTC), independent of any factory system working date
    const realActualIsoTime = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, 
      action, 
      tableName, 
      String(recordId), 
      oldValue ? JSON.stringify(oldValue) : null, 
      newValue ? JSON.stringify(newValue) : null,
      ip,
      realActualIsoTime
    );
  } catch (e) {
    console.error('Audit Logging Failed:', e);
  }
};

export const findPO = (poNum: string) => {
  const norm = (s: any) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  let po: any = db.prepare('SELECT * FROM production_orders WHERE po_number = ?').get(poNum);
  if (!po) po = db.prepare('SELECT * FROM production_orders WHERE TRIM(po_number) = ?').get(poNum);
  if (!po) {
    const allPOs = db.prepare('SELECT * FROM production_orders').all();
    const targetNorm = norm(poNum);
    po = allPOs.find((p: any) => norm(p.po_number) === targetNorm);
  }
  return po;
};

export const getRecordTimestamp = (req: any): string => {
  const localTimeHeader = req.headers['x-local-time'];
  let realLocalTimeStr: string;
  if (localTimeHeader && typeof localTimeHeader === 'string') {
    realLocalTimeStr = localTimeHeader.replace('T', ' ').substring(0, 19);
  } else {
    // Fallback to local time
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000;
    realLocalTimeStr = (new Date(now.getTime() - tzoffset)).toISOString().replace('T', ' ').substring(0, 19);
  }

  const workingDateSetting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'working_date'").get();
  const workingDate = workingDateSetting?.value;

  if (workingDate && workingDate.trim() !== '') {
    return workingDate.trim();
  }

  return realLocalTimeStr;
};
