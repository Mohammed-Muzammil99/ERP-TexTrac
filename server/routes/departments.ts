import { Router } from 'express';
import { body } from 'express-validator';
import { db } from '../db';
import { authenticateToken, isAdmin, validate } from '../middleware';

const router = Router();

// Get all departments (Authenticated users only)
router.get('/departments', authenticateToken, (req, res) => {
  try {
    const departments = db.prepare('SELECT id, name, is_system, created_at FROM departments ORDER BY is_system DESC, name ASC').all();
    res.json(departments);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch departments', message: e.message });
  }
});

// Create new department (Admin only, cannot modify or delete standard departments)
router.post('/departments',
  authenticateToken,
  isAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Department name must be at least 2 characters'),
  validate,
  (req, res) => {
    const { name } = req.body;
    const normalizedName = name.trim();

    try {
      // Check if case-insensitive name already exists
      const existing = db.prepare('SELECT id FROM departments WHERE LOWER(name) = ?').get(normalizedName.toLowerCase());
      if (existing) {
        return res.status(400).json({ error: 'Department already exists' });
      }

      db.prepare('INSERT INTO departments (name, is_system) VALUES (?, 0)').run(normalizedName);
      res.status(201).json({ success: true, name: normalizedName });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to create department', message: e.message });
    }
  }
);

export default router;
