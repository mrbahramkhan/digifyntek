const express = require('express');
const { auth, requirePermission, requireRole } = require('../middleware/auth');
const rbac = require('../rbac/matrix');
const pool = require('../config/db');
const router = express.Router();

router.get('/me', auth(), async (req, res, next) => {
  try {
    const role = req.user?.role;
    const permissions = await rbac.permissionsForRole(role);
    res.json({
      userId: req.user?.userId || req.user?.id,
      orgId: req.user?.orgId,
      role,
      permissions,
      is_super: permissions.includes('*'),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/matrix', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    res.json(await rbac.getMatrixView());
  } catch (e) {
    next(e);
  }
});

router.get('/roles', auth(), async (req, res, next) => {
  try {
    res.json(await rbac.listRoles());
  } catch (e) {
    next(e);
  }
});

router.get('/permissions', auth(), async (req, res, next) => {
  try {
    res.json(await rbac.listPermissions());
  } catch (e) {
    next(e);
  }
});

/** List app users (for role assignment) */
router.get('/users', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, full_name, role, org_id, is_active, last_login_at, created_at
       FROM users ORDER BY id LIMIT 500`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** Assign role to user */
router.patch('/users/:userId/role', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const role = String(req.body?.role || '').trim().toLowerCase();
    if (!role) return res.status(400).json({ error: 'role required' });
    if (role === 'superadmin' && String(req.user.role).toLowerCase() !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can assign superadmin' });
    }
    const [r] = await pool.query(
      `UPDATE users SET role = ? WHERE user_id = ? OR id = ?`,
      [role, req.params.userId, req.params.userId]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'User not found' });
    const [[u]] = await pool.query(
      `SELECT id, user_id, full_name, role, is_active FROM users WHERE user_id = ? OR id = ? LIMIT 1`,
      [req.params.userId, req.params.userId]
    );
    res.json(u);
  } catch (e) {
    next(e);
  }
});

/** Grant permission to role */
router.post('/roles/:roleCode/permissions', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const role = String(req.params.roleCode).toLowerCase();
    const perm = String(req.body?.perm_code || req.body?.permission || '').trim();
    if (!perm) return res.status(400).json({ error: 'perm_code required' });
    if (role === 'superadmin') return res.status(400).json({ error: 'superadmin has implicit *' });
    await pool.query(
      `INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES (?, ?)`,
      [role, perm]
    );
    rbac.invalidate();
    res.status(201).json({ role_code: role, perm_code: perm, granted: true });
  } catch (e) {
    next(e);
  }
});

/** Revoke permission from role */
router.delete('/roles/:roleCode/permissions/:permCode', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const role = String(req.params.roleCode).toLowerCase();
    const perm = req.params.permCode;
    if (role === 'superadmin' || role === 'admin') {
      return res.status(400).json({ error: 'Cannot strip admin/superadmin matrix this way' });
    }
    await pool.query(`DELETE FROM cbs_role_permissions WHERE role_code = ? AND perm_code = ?`, [role, perm]);
    rbac.invalidate();
    res.json({ role_code: role, perm_code: perm, revoked: true });
  } catch (e) {
    next(e);
  }
});

/** Replace full permission set for a role */
router.put('/roles/:roleCode/permissions', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const role = String(req.params.roleCode).toLowerCase();
    const list = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    if (role === 'superadmin') return res.status(400).json({ error: 'superadmin is fixed *' });
    await pool.query(`DELETE FROM cbs_role_permissions WHERE role_code = ?`, [role]);
    for (const perm of list) {
      await pool.query(
        `INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES (?, ?)`,
        [role, String(perm)]
      );
    }
    rbac.invalidate();
    res.json({ role_code: role, permissions: list });
  } catch (e) {
    next(e);
  }
});

router.post('/invalidate-cache', auth(), requirePermission('admin.rbac'), async (req, res) => {
  rbac.invalidate();
  res.json({ ok: true });
});

module.exports = router;
