import { Router } from 'express';
import { body } from 'express-validator';
import { db } from '../db';
import { authenticateToken, isAdmin, validate } from '../middleware';

const router = Router();

// Get all custom forms (Authenticated users)
router.get('/custom-forms', authenticateToken, (req, res) => {
  try {
    const forms = db.prepare(`
      SELECT f.id, f.form_name, f.department_name, f.schema_json, f.created_at,
             (SELECT COUNT(*) FROM custom_form_data d WHERE d.form_id = f.id) as submission_count
      FROM custom_forms f
      ORDER BY f.created_at DESC
    `).all();

    // Map schemas back to objects
    const resolved = forms.map((f: any) => ({
      ...f,
      schema: f.schema_json ? JSON.parse(f.schema_json) : []
    }));

    res.json(resolved);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch forms', message: e.message });
  }
});

// Create a new custom form Schema (Admin only)
router.post('/custom-forms',
  authenticateToken,
  isAdmin,
  body('form_name').trim().isLength({ min: 2 }).withMessage('Form name must be at least 2 characters'),
  body('department_name').trim().isLength({ min: 2 }).withMessage('Department must be specified'),
  body('schema').isArray().withMessage('Fields schema must be an array of column definitions'),
  validate,
  (req, res) => {
    const { form_name, department_name, schema } = req.body;

    try {
      // Check if case-insensitive name already exists in this department
      const existing = db.prepare('SELECT id FROM custom_forms WHERE LOWER(form_name) = ? AND LOWER(department_name) = ?')
        .get(form_name.toLowerCase(), department_name.toLowerCase());

      if (existing) {
        return res.status(400).json({ error: 'Form with this name already exists in this department' });
      }

      const stmt = db.prepare(`
        INSERT INTO custom_forms (form_name, department_name, schema_json)
        VALUES (?, ?, ?)
      `);

      const result = stmt.run(form_name.trim(), department_name.trim(), JSON.stringify(schema));
      res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to create form schema', message: e.message });
    }
  }
);

// Delete custom form Schema and data (Admin only)
router.delete('/custom-forms/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;
  try {
    db.transaction(() => {
      // Delete submitted entries
      db.prepare('DELETE FROM custom_form_data WHERE form_id = ?').run(id);
      // Delete the form definition
      db.prepare('DELETE FROM custom_forms WHERE id = ?').run(id);
    })();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to delete form', message: e.message });
  }
});

// Get submitted data list for a specific form (Authenticated users)
router.get('/custom-forms/:id/data', authenticateToken, (req, res) => {
  const { id } = req.params;

  try {
    const form = db.prepare('SELECT * FROM custom_forms WHERE id = ?').get(id) as any;
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const data = db.prepare(`
      SELECT d.id, d.data_json, d.created_at, u.full_name as creator_name
      FROM custom_form_data d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.form_id = ?
      ORDER BY d.created_at DESC
    `).all(id);

    const resolvedData = data.map((d: any) => ({
      id: d.id,
      created_at: d.created_at,
      creator_name: d.creator_name || 'System',
      values: d.data_json ? JSON.parse(d.data_json) : {}
    }));

    res.json({
      form: {
        id: form.id,
        form_name: form.form_name,
        department_name: form.department_name,
        schema: form.schema_json ? JSON.parse(form.schema_json) : []
      },
      submissions: resolvedData
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch form submissions', message: e.message });
  }
});

// Submit a new entry for a specific form (Authenticated users)
router.post('/custom-forms/:id/data', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { values } = req.body;

  try {
    const form = db.prepare('SELECT id, schema_json FROM custom_forms WHERE id = ?').get(id) as any;
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Insert new record
    const stmt = db.prepare(`
      INSERT INTO custom_form_data (form_id, data_json, created_by)
      VALUES (?, ?, ?)
    `);

    const creatorId = (req as any).user?.id || null;
    stmt.run(id, JSON.stringify(values || {}), creatorId);

    res.status(201).json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to submit form entries', message: e.message });
  }
});

// Helper endpoint to fetch standard auto-complete/suggest/fetchable fields in ERP matching dropdown structures
router.get('/custom-forms-fetchable-sources', authenticateToken, (req, res) => {
  let activePOs: any[] = [];
  let styleNumbers: any[] = [];
  let colors: any[] = [];
  let operators: any[] = [];

  try {
    try {
      activePOs = db.prepare(`SELECT po_number, buyer FROM production_orders WHERE status = 'Active'`).all();
    } catch (e: any) {
      console.error('Error fetching production_orders for custom forms:', e.message);
    }

    try {
      styleNumbers = db.prepare(`SELECT DISTINCT style_num FROM po_products WHERE style_num IS NOT NULL AND style_num != ''`).all().map((s: any) => s.style_num);
    } catch (e: any) {
      console.error('Error fetching style numbers for custom forms:', e.message);
    }

    try {
      colors = db.prepare('SELECT name FROM colors ORDER BY name').all().map((c: any) => c.name);
    } catch (e: any) {
      console.error('Error fetching colors for custom forms:', e.message);
    }

    try {
      operators = db.prepare('SELECT id, full_name, role, department FROM users WHERE is_active = 1').all();
    } catch (e: any) {
      console.error('Error fetching users for custom forms:', e.message);
    }

    res.json({
      pos: activePOs,
      styles: styleNumbers,
      colors: colors,
      operators: operators
    });
  } catch (e: any) {
    res.status(550).json({ error: 'Failed to fetch relational source options', message: e.message });
  }
});

export default router;
