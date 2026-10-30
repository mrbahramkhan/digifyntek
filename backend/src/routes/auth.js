const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../services/logger');
const { requireFields } = require('../middleware/validate');
const { auth, requireRole } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const pool = require('../config/db');
const totp = require('../services/totp');
const router = express.Router();

const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';
const ADMIN_ROLES = new Set(['superadmin', 'admin']);
const MFA_ENFORCE_ADMIN = process.env.MFA_ENFORCE_ADMIN !== '0'; // default on

/** short-lived pending MFA tokens (in-memory; production: Redis) */
const pendingMfa = new Map();
const PENDING_TTL_MS = 5 * 60 * 1000;

function cleanPending() {
  const now = Date.now();
  for (const [k, v] of pendingMfa) {
    if (v.exp < now) pendingMfa.delete(k);
  }
}

function issuePendingMfa(userPayload) {
  cleanPending();
  const id = crypto.randomBytes(24).toString('hex');
  pendingMfa.set(id, { ...userPayload, exp: Date.now() + PENDING_TTL_MS });
  return id;
}

function takePending(id) {
  cleanPending();
  const row = pendingMfa.get(id);
  if (!row) return null;
  pendingMfa.delete(id);
  if (row.exp < Date.now()) return null;
  return row;
}

function signAccess(u) {
  return jwt.sign(
    { id: u.id, userId: u.userId, orgId: u.orgId, role: u.role, mfa: true },
    env.jwtSecret,
    { expiresIn: env.jwtExpires }
  );
}

async function ensureMfaColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(64) NULL`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN mfa_enforced TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (_) {}
}

function needsMfaChallenge(u) {
  const role = String(u.role || '').toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role);
  if (!isAdmin) return { challenge: false };
  if (Number(u.mfa_enabled) === 1 && u.mfa_secret) {
    return { challenge: true, setup: false };
  }
  if (MFA_ENFORCE_ADMIN || Number(u.mfa_enforced) === 1) {
    return { challenge: true, setup: true };
  }
  return { challenge: false };
}

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
      else ok = password === hash;
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

    await ensureMfaColumns();

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE user_id = :userId AND is_active = 1 LIMIT 1',
      { userId }
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = {
      id: u.id,
      userId: u.user_id,
      orgId: u.org_id,
      role: u.role,
      fullName: u.full_name,
      mfa_secret: u.mfa_secret,
      mfa_enabled: u.mfa_enabled,
    };

    const mfa = needsMfaChallenge(u);
    if (mfa.challenge) {
      const mfaToken = issuePendingMfa(payload);
      return res.json({
        mfa_required: true,
        mfa_setup_required: !!mfa.setup,
        mfa_token: mfaToken,
        user: {
          userId: u.user_id,
          fullName: u.full_name,
          role: u.role,
        },
        message: mfa.setup
          ? 'Admin MFA setup required before access'
          : 'Enter authenticator code',
      });
    }

    const token = signAccess(payload);
    try {
      await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [u.id]);
    } catch (_) {}
    res.json({
      token,
      user: { id: u.id, userId: u.user_id, fullName: u.full_name, role: u.role, orgId: u.org_id },
    });
  } catch (e) {
    next(e);
  }
});

/** Complete login with TOTP */
router.post('/mfa/verify', requireFields(['mfa_token', 'code']), async (req, res, next) => {
  try {
    const pending = takePending(String(req.body.mfa_token));
    if (!pending) return res.status(401).json({ error: 'MFA session expired — login again' });

    if (!pending.mfa_secret || !Number(pending.mfa_enabled)) {
      return res.status(400).json({
        error: 'MFA not enrolled',
        mfa_setup_required: true,
      });
    }

    if (!totp.verify(pending.mfa_secret, req.body.code)) {
      return res.status(401).json({ error: 'Invalid MFA code' });
    }

    const token = signAccess(pending);
    try {
      await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [pending.id]);
    } catch (_) {}
    res.json({
      token,
      user: {
        id: pending.id,
        userId: pending.userId,
        fullName: pending.fullName,
        role: pending.role,
        orgId: pending.orgId,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Begin MFA enrollment (password already verified via mfa_token OR logged-in admin)
 * Body: { mfa_token? } OR Authorization Bearer
 */
router.post('/mfa/setup/begin', async (req, res, next) => {
  try {
    await ensureMfaColumns();
    let userId = null;
    let userRow = null;

    if (req.body?.mfa_token) {
      const pending = pendingMfa.get(String(req.body.mfa_token));
      if (!pending || pending.exp < Date.now()) {
        return res.status(401).json({ error: 'MFA session expired — login again' });
      }
      userId = pending.userId;
    } else {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const decoded = jwt.verify(token, env.jwtSecret);
      userId = decoded.userId;
      if (!ADMIN_ROLES.has(String(decoded.role || '').toLowerCase())) {
        return res.status(403).json({ error: 'MFA setup for admin roles' });
      }
    }

    const [rows] = await pool.query(`SELECT * FROM users WHERE user_id = ? LIMIT 1`, [userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    userRow = rows[0];

    const secret = totp.generateSecret();
    // store pending secret without enabling yet
    await pool.query(`UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?`, [
      secret,
      userRow.id,
    ]);

    const otpauth = totp.otpauthUrl({
      secret,
      accountName: userRow.user_id,
      issuer: process.env.MFA_ISSUER || 'DigiFyntek',
    });

    res.json({
      secret,
      otpauth_url: otpauth,
      message: 'Add to Google Authenticator / Authy, then confirm with a code',
    });
  } catch (e) {
    next(e);
  }
});

/** Confirm enrollment with first TOTP code */
router.post('/mfa/setup/confirm', requireFields(['code']), async (req, res, next) => {
  try {
    let userId = null;
    let pendingId = null;

    if (req.body?.mfa_token) {
      const pending = pendingMfa.get(String(req.body.mfa_token));
      if (!pending || pending.exp < Date.now()) {
        return res.status(401).json({ error: 'MFA session expired — login again' });
      }
      userId = pending.userId;
      pendingId = String(req.body.mfa_token);
    } else {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const decoded = jwt.verify(token, env.jwtSecret);
      userId = decoded.userId;
    }

    const [rows] = await pool.query(`SELECT * FROM users WHERE user_id = ? LIMIT 1`, [userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    if (!u.mfa_secret) return res.status(400).json({ error: 'Call setup/begin first' });

    if (!totp.verify(u.mfa_secret, req.body.code)) {
      return res.status(401).json({ error: 'Invalid MFA code — try again' });
    }

    await pool.query(
      `UPDATE users SET mfa_enabled = 1, mfa_enforced = 1 WHERE id = ?`,
      [u.id]
    );

    // If coming from login challenge, issue full token
    if (pendingId) {
      const pending = takePending(pendingId);
      if (pending) {
        pending.mfa_enabled = 1;
        pending.mfa_secret = u.mfa_secret;
        const token = signAccess(pending);
        return res.json({
          enabled: true,
          token,
          user: {
            id: pending.id,
            userId: pending.userId,
            fullName: pending.fullName,
            role: pending.role,
            orgId: pending.orgId,
          },
        });
      }
    }

    res.json({ enabled: true, message: 'MFA enabled' });
  } catch (e) {
    next(e);
  }
});

/** Disable MFA — superadmin only on others; self with code */
router.post('/mfa/disable', auth(), requireFields(['code']), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM users WHERE user_id = ? LIMIT 1`, [
      req.user.userId,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    if (!u.mfa_secret || !Number(u.mfa_enabled)) {
      return res.json({ enabled: false, message: 'MFA already off' });
    }
    if (!totp.verify(u.mfa_secret, req.body.code)) {
      return res.status(401).json({ error: 'Invalid MFA code' });
    }
    // Admins cannot fully disable if enforce is on — keep enforced, just rotate by re-setup
    if (MFA_ENFORCE_ADMIN && ADMIN_ROLES.has(String(u.role).toLowerCase())) {
      return res.status(400).json({
        error: 'Admin MFA cannot be disabled while MFA_ENFORCE_ADMIN=1. Re-enroll via setup instead.',
      });
    }
    await pool.query(
      `UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?`,
      [u.id]
    );
    res.json({ enabled: false });
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
    mfa: !!req.user.mfa,
  });
});

router.get('/mfa/status', auth(), async (req, res, next) => {
  try {
    await ensureMfaColumns();
    const [[u]] = await pool.query(
      `SELECT mfa_enabled, mfa_enforced, role FROM users WHERE user_id = ? LIMIT 1`,
      [req.user.userId]
    );
    res.json({
      mfa_enabled: !!(u && Number(u.mfa_enabled)),
      mfa_enforced: !!(u && (Number(u.mfa_enforced) || ADMIN_ROLES.has(String(u.role).toLowerCase()))),
      role: u?.role,
      enforce_admin: MFA_ENFORCE_ADMIN,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
