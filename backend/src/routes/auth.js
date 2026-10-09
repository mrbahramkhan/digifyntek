const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../services/logger');
const { requireFields } = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const pool = require('../config/db');
const router = express.Router();

const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';

router.post('/login', requireFields(['userId', 'password']), async (req, res, next) => {
  try {
    const userId = String(req.body.userId).trim();
    const password = String(req.body.password);

    if (LEGACY) {
      const u = await legacy.loginUser(userId);
      if (!u) return res.status(401).json({ error: 'Invalid credentials' });
      if (u.user_locked) return res.status(403).json({ error: 'Account locked' });
      const hash = u.user_password || '';
      let ok = false;
      if (hash.startsWith('$2')) ok = await bcrypt.compare(password, hash);
      else ok = password === hash; // rare plain legacy
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign(
        {
          id: u.user_id,
          userId: u.user_id,
          orgId: u.por_orgacode,
          orgCode: u.por_orgacode,
          vacCode: u.user_homevac || null,
          role: u.user_role || u.user_type || 'user',
        },
        env.jwtSecret,
        { expiresIn: env.jwtExpires }
      );
      logger.info('legacy login ok', { userId });
      return res.json({
        token,
        user: {
          id: u.user_id,
          userId: u.user_id,
          fullName: u.user_name,
          role: u.user_role || u.user_type,
          orgId: u.por_orgacode,
          orgCode: u.por_orgacode,
          vacCode: u.user_homevac,
        },
      });
    }

    // DigiFyntek native schema
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE user_id = :userId AND is_active = 1 LIMIT 1',
      { userId }
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: u.id, userId: u.user_id, orgId: u.org_id, role: u.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpires }
    );
    res.json({
      token,
      user: { id: u.id, userId: u.user_id, fullName: u.full_name, role: u.role, orgId: u.org_id },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', auth(), async (req, res) => {
  res.json({
    id: req.user.id || req.user.userId,
    userId: req.user.userId,
    role: req.user.role,
    orgId: req.user.orgId || req.user.orgCode,
    vacCode: req.user.vacCode || null,
  });
});

module.exports = router;
