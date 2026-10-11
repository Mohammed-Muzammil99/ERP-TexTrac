import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { db } from './db';

export const JWT_SECRET = process.env.JWT_SECRET || 'erp-secret-key-change-in-production-2024';

// Request Logger
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = req.user ? req.user.username : 'guest';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms) - ${user}`);
  });
  next();
};

// Auth Middleware
export const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(401);
    req.user = user;
    next();
  });
};

export const isAdmin = (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  // Token claims admin
  if (String(req.user.role).toLowerCase() === 'admin') {
    return next();
  }

  // Check database in case role was updated in current session
  try {
    const dbUser: any = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (dbUser && String(dbUser.role).toLowerCase() === 'admin') {
      req.user.role = 'admin';
      return next();
    }
  } catch {}

  return res.status(403).json({ error: 'Admin access required' });
};

export const authorize = (roles: string[], departments?: string[]) => {
  return (req: any, res: any, next: any) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });
    
    // Admin bypass (check JWT + fallback DB)
    if (String(user.role).toLowerCase() === 'admin') return next();
    try {
      const dbUser: any = db.prepare('SELECT role, department, allowed_departments FROM users WHERE id = ?').get(user.id);
      if (dbUser) {
        if (String(dbUser.role).toLowerCase() === 'admin') {
          user.role = 'admin';
          return next();
        }
        // Update user snapshot with fresh DB values if available
        if (dbUser.department) user.department = dbUser.department;
        if (dbUser.allowed_departments) user.allowed_departments = dbUser.allowed_departments;
        if (dbUser.role) user.role = dbUser.role;
      }
    } catch {}

    // Check role
    const normalizedRoles = roles.map(r => r.toLowerCase());
    if (!normalizedRoles.includes(String(user.role).toLowerCase())) {
      return res.status(403).json({ error: `Permission denied: role ${user.role} not allowed` });
    }

    // Check department if restricted
    if (departments && departments.length > 0) {
      const isUniversalSupervisor = String(user.role).toLowerCase() === 'supervisor' && String(user.department).toLowerCase() === 'all';
      if (!isUniversalSupervisor) {
        let allowedDepts: string[] = [];
        if (user.department) allowedDepts.push(String(user.department));
        if (Array.isArray(user.allowed_departments)) {
          allowedDepts.push(...user.allowed_departments.map(String));
        } else if (typeof user.allowed_departments === 'string') {
          try {
            const parsed = JSON.parse(user.allowed_departments);
            if (Array.isArray(parsed)) allowedDepts.push(...parsed.map(String));
          } catch {}
        }

        const normalizedAllowed = allowedDepts.map(d => d.trim().toLowerCase());
        const matchesDept = departments.some(dept => normalizedAllowed.includes(dept.trim().toLowerCase()));

        if (!matchesDept) {
          return res.status(403).json({ error: `Permission denied: access restricted to ${departments.join(', ')} department(s)` });
        }
      }
    }

    next();
  };
};

export const validate = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation Error', 
      details: errors.array(),
      message: errors.array().map(e => e.msg).join(', ') 
    });
  }
  next();
};

export const isSupervisorOrAdmin = authorize(['supervisor']); // Admin already bypasses
export const isOperatorOrAbove = authorize(['operator', 'supervisor']);
export const isAllRolesExceptViewer = authorize(['operator', 'supervisor']);
