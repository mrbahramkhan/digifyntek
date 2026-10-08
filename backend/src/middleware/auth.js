const jwt = require('jsonwebtoken');
const env = require('../config/env');

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

/** roles: string | string[] */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (allowed.length && !allowed.includes(req.user.role) && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { auth, requireRole };
