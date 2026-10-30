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


const SYSTEM_ROLES = new Set(['superadmin', 'admin']);

/** Role detail + user count + permissions */
router.get('/roles/:roleCode', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const code = String(req.params.roleCode).toLowerCase();
    const [[role]] = await pool.query(`SELECT * FROM cbs_roles WHERE role_code = ?`, [code]);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    const [perms] = await pool.query(
      `SELECT p.perm_code, p.module, p.description
       FROM cbs_role_permissions rp
       JOIN cbs_permissions p ON p.perm_code = rp.perm_code
       WHERE rp.role_code = ?
       ORDER BY p.module, p.perm_code`,
      [code]
    );
    const [[uc]] = await pool.query(
      `SELECT COUNT(*) AS user_count FROM users WHERE role = ?`,
      [code]
    );
    res.json({
      ...role,
      permissions: code === 'superadmin' || code === 'admin' ? ['*'] : perms,
      user_count: Number(uc.user_count || 0),
    });
  } catch (e) {
    next(e);
  }
});

/** Create role */
router.post('/roles', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const code = String(b.role_code || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = String(b.role_name || code).trim();
    const description = b.description ? String(b.description).trim() : null;
    if (!code || code.length < 2) return res.status(400).json({ error: 'role_code required (min 2 chars)' });
    if (SYSTEM_ROLES.has(code)) return res.status(400).json({ error: 'Cannot create reserved system role' });
    await pool.query(
      `INSERT INTO cbs_roles (role_code, role_name, description, is_system) VALUES (?, ?, ?, 0)`,
      [code, name, description]
    );
    const perms = Array.isArray(b.permissions) ? b.permissions : [];
    for (const perm of perms) {
      await pool.query(
        `INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES (?, ?)`,
        [code, String(perm)]
      );
    }
    rbac.invalidate();
    const [[role]] = await pool.query(`SELECT * FROM cbs_roles WHERE role_code = ?`, [code]);
    res.status(201).json(role);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Role already exists' });
    next(e);
  }
});

/** Update role name/description */
router.patch('/roles/:roleCode', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const code = String(req.params.roleCode).toLowerCase();
    if (SYSTEM_ROLES.has(code) && String(req.user.role).toLowerCase() !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can edit system roles metadata' });
    }
    const b = req.body || {};
    const fields = [];
    const vals = [];
    if (b.role_name != null) { fields.push('role_name = ?'); vals.push(String(b.role_name).trim()); }
    if (b.description != null) { fields.push('description = ?'); vals.push(String(b.description).trim()); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(code);
    const [r] = await pool.query(`UPDATE cbs_roles SET ${fields.join(', ')} WHERE role_code = ?`, vals);
    if (!r.affectedRows) return res.status(404).json({ error: 'Role not found' });
    rbac.invalidate();
    const [[role]] = await pool.query(`SELECT * FROM cbs_roles WHERE role_code = ?`, [code]);
    res.json(role);
  } catch (e) {
    next(e);
  }
});

/** Delete custom role (not system, no users) */
router.delete('/roles/:roleCode', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const code = String(req.params.roleCode).toLowerCase();
    if (SYSTEM_ROLES.has(code) || code === 'viewer' || code === 'teller') {
      return res.status(400).json({ error: 'Cannot delete protected role' });
    }
    const [[role]] = await pool.query(`SELECT * FROM cbs_roles WHERE role_code = ?`, [code]);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (Number(role.is_system) === 1 && String(req.user.role).toLowerCase() !== 'superadmin') {
      return res.status(403).json({ error: 'System role — superadmin only' });
    }
    const [[uc]] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role = ?`, [code]);
    if (Number(uc.c) > 0) {
      return res.status(400).json({ error: `Role in use by ${uc.c} user(s). Reassign users first.` });
    }
    await pool.query(`DELETE FROM cbs_role_permissions WHERE role_code = ?`, [code]);
    await pool.query(`DELETE FROM cbs_roles WHERE role_code = ?`, [code]);
    rbac.invalidate();
    res.json({ deleted: true, role_code: code });
  } catch (e) {
    next(e);
  }
});

/** Clone role */
router.post('/roles/:roleCode/clone', auth(), requirePermission('admin.rbac'), async (req, res, next) => {
  try {
    const src = String(req.params.roleCode).toLowerCase();
    const b = req.body || {};
    const code = String(b.role_code || `${src}_copy`).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = String(b.role_name || `${src} copy`).trim();
    if (SYSTEM_ROLES.has(code)) return res.status(400).json({ error: 'Invalid target role code' });
    const [[exists]] = await pool.query(`SELECT role_code FROM cbs_roles WHERE role_code = ?`, [src]);
    if (!exists) return res.status(404).json({ error: 'Source role not found' });
    await pool.query(
      `INSERT INTO cbs_roles (role_code, role_name, description, is_system) VALUES (?, ?, ?, 0)`,
      [code, name, b.description || `Cloned from ${src}`]
    );
    if (src === 'superadmin' || src === 'admin') {
      await pool.query(
        `INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code)
         SELECT ?, perm_code FROM cbs_permissions`,
        [code]
      );
    } else {
      await pool.query(
        `INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code)
         SELECT ?, perm_code FROM cbs_role_permissions WHERE role_code = ?`,
        [code, src]
      );
    }
    rbac.invalidate();
    const [[role]] = await pool.query(`SELECT * FROM cbs_roles WHERE role_code = ?`, [code]);
    res.status(201).json(role);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Target role already exists' });
    next(e);
  }
});


router.post('/invalidate-cache', auth(), requirePermission('admin.rbac'), async (req, res) => {
  rbac.invalidate();
  res.json({ ok: true });
});

module.exports = router;
