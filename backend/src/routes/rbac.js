const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const rbac = require('../rbac/matrix');
const router = express.Router();

router.get('/me', auth(), async (req, res, next) => {
  try {
    const role = req.user?.role;
    const permissions = await rbac.permissionsForRole(role);
    res.json({
      userId: req.user?.userId || req.user?.id,
      role,
      permissions,
      is_super: permissions.includes('*'),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/matrix', auth(), requirePermission('admin.rbac', 'ledger.read'), async (req, res, next) => {
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

router.post('/invalidate-cache', auth(), requirePermission('admin.rbac'), async (req, res) => {
  rbac.invalidate();
  res.json({ ok: true });
});

module.exports = router;
