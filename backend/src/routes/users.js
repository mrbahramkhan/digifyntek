/**
 * User management — create, list, update, activate, reset password, assign role
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { auth, requirePermission, requireRole } = require('../middleware/auth');
const pool = require('../config/db');
const router = express.Router();

function canManageUsers(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'superadmin' || role === 'admin';
}

router.get('/', auth(), requirePermission('admin.rbac', 'admin.setup'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, org_id, user_id, full_name, role, is_active,
              last_login_at, created_at,
              COALESCE(mfa_enabled, 0) AS mfa_enabled
       FROM users
       ORDER BY id
       LIMIT 500`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), requirePermission('admin.rbac', 'admin.setup'), async (req, res, next) => {
  try {
    const [[u]] = await pool.query(
      `SELECT id, org_id, user_id, full_name, role, is_active, last_login_at, created_at,
              COALESCE(mfa_enabled, 0) AS mfa_enabled
       FROM users WHERE id = ? OR user_id = ? LIMIT 1`,
      [req.params.id, req.params.id]
    );
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(u);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), requirePermission('admin.rbac', 'admin.setup'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const userId = String(b.user_id || b.userId || '').trim();
    const password = String(b.password || '');
    const fullName = String(b.full_name || b.fullName || userId).trim();
    let role = String(b.role || 'viewer').trim().toLowerCase();
    if (!userId) return res.status(400).json({ error: 'user_id required' });
    if (password.length < 8) return res.status(400).json({ error: 'password min 8 characters' });
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'password must include letters and numbers' });
    }
    if (role === 'superadmin' && String(req.user.role).toLowerCase() !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can create superadmin' });
    }
    const hash = await bcrypt.hash(password, 10);
    const orgId = b.org_id != null ? Number(b.org_id) : req.user.orgId || 1;
    const [ins] = await pool.query(
      `INSERT INTO users (org_id, user_id, password_hash, full_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, userId, hash, fullName, role, b.is_active === false || b.is_active === 0 ? 0 : 1]
    );
    const [[u]] = await pool.query(
      `SELECT id, org_id, user_id, full_name, role, is_active, created_at FROM users WHERE id = ?`,
      [ins.insertId]
    );
    res.status(201).json(u);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'user_id already exists' });
    next(e);
  }
});

router.patch('/:id', auth(), requirePermission('admin.rbac', 'admin.setup'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const [[existing]] = await pool.query(
      `SELECT * FROM users WHERE id = ? OR user_id = ? LIMIT 1`,
      [req.params.id, req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'User not found' });

    let role = b.role != null ? String(b.role).trim().toLowerCase() : existing.role;
    if (role === 'superadmin' && String(req.user.role).toLowerCase() !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can assign superadmin' });
    }
    const fullName = b.full_name != null || b.fullName != null
      ? String(b.full_name || b.fullName).trim()
      : existing.full_name;
    const isActive = b.is_active != null ? (b.is_active ? 1 : 0) : existing.is_active;

    await pool.query(
      `UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?`,
      [fullName, role, isActive, existing.id]
    );

    if (b.password && String(b.password).length >= 6) {
      const hash = await bcrypt.hash(String(b.password), 10);
      await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, existing.id]);
    }

    const [[u]] = await pool.query(
      `SELECT id, org_id, user_id, full_name, role, is_active, created_at FROM users WHERE id = ?`,
      [existing.id]
    );
    res.json(u);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reset-password', auth(), requirePermission('admin.rbac', 'admin.setup'), async (req, res, next) => {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'password min 8 characters' });
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'password must include letters and numbers' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      `UPDATE users SET password_hash = ? WHERE id = ? OR user_id = ?`,
      [hash, req.params.id, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, message: 'Password updated' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/toggle-active', auth(), requirePermission('admin.rbac', 'admin.setup'), async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      `SELECT id, is_active FROM users WHERE id = ? OR user_id = ? LIMIT 1`,
      [req.params.id, req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const nextVal = existing.is_active ? 0 : 1;
    await pool.query(`UPDATE users SET is_active = ? WHERE id = ?`, [nextVal, existing.id]);
    res.json({ id: existing.id, is_active: nextVal });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
