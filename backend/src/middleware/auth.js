const jwt = require('jsonwebtoken');
const env = require('../config/env');
const rbac = require('../rbac/matrix');

function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) {
      if (required) return res.status(401).json({ error: 'Unauthorized' });
      return next();
    }
    try {
      req.user = jwt.verify(token, env.jwtSecret);
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/** roles: string | string[] — legacy role gate */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const role = String(req.user.role || '').toLowerCase();
    if (role === 'superadmin' || role === 'admin') return next();
    if (allowed.length && !allowed.map((r) => String(r).toLowerCase()).includes(role)) {
      return res.status(403).json({ error: 'Forbidden', required_roles: allowed });
    }
    next();
  };
}

/**
 * Permission gate — use after auth()
 * requirePermission('loan.disburse') or requirePermission('ledger.post', 'ledger.reverse')
 * (any of the listed permissions grants access)
 */
function requirePermission(...perms) {
  const needed = perms.flat().filter(Boolean);
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      const role = req.user.role;
      if (!needed.length) return next();
      for (const p of needed) {
        if (await rbac.hasPermission(role, p)) {
          req.permissionGranted = p;
          return next();
        }
      }
      return res.status(403).json({
        error: 'Forbidden',
        required_permissions: needed,
        role,
      });
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { auth, requireRole, requirePermission };
