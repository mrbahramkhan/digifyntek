const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');
const logger = require('../services/logger');
const { writeAudit } = require('../middleware/audit');
const { requireFields } = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.post('/login', requireFields(['userId', 'password']), async (req, res, next) => {
  try {
    const userId = String(req.body.userId).trim();
    const password = String(req.body.password);

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE user_id = :userId AND is_active = 1 LIMIT 1',
      { userId }
    );
    if (!rows.length) {
      logger.warn('login failed', { userId, reason: 'not_found' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const u = rows[0];

    // Production: bcrypt only — no plain-text bypass
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      logger.warn('login failed', { userId, reason: 'bad_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: u.id, userId: u.user_id, orgId: u.org_id, role: u.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpires }
    );

    await writeAudit(u.id, 'login', 'user', u.id, { userId });
    logger.info('login ok', { userId });

    res.json({
      token,
      user: {
        id: u.id,
        userId: u.user_id,
        fullName: u.full_name,
        role: u.role,
        orgId: u.org_id,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, full_name, role, org_id, is_active FROM users WHERE id = :id',
      { id: req.user.id }
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    res.json({
      id: u.id,
      userId: u.user_id,
      fullName: u.full_name,
      role: u.role,
      orgId: u.org_id,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/change-password', auth(), requireFields(['currentPassword', 'newPassword']), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE id = :id', { id: req.user.id });
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(String(newPassword), 12);
    await pool.query('UPDATE users SET password_hash = :hash WHERE id = :id', {
      hash,
      id: req.user.id,
    });
    await writeAudit(req.user.id, 'change_password', 'user', req.user.id, {});
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
