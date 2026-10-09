const express = require('express');
const { auth } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const pool = require('../config/db');
const router = express.Router();
const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';

function orgCode(req) {
  return req.user.orgCode || req.user.orgId || '001';
}

router.get('/', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const rows = await legacy.listFarmers({
        orgCode: orgCode(req),
        vacCode: req.query.vacCode || req.user.vacCode || null,
        q: req.query.q || req.query.search || null,
      });
      return res.json(rows);
    }
    const [rows] = await pool.query(
      `SELECT * FROM members WHERE org_id = :orgId ORDER BY id DESC LIMIT 200`,
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/360', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const data = await legacy.farmer360(req.params.id, orgCode(req));
      if (!data) return res.status(404).json({ error: 'Not found' });
      return res.json(data);
    }
    res.status(501).json({ error: 'Use legacy DB or native 360' });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const rows = await legacy.listFarmers({ orgCode: orgCode(req), q: req.params.id, limit: 5 });
      const one = rows.find((r) => String(r.id) === String(req.params.id)) || rows[0];
      if (!one) return res.status(404).json({ error: 'Not found' });
      return res.json(one);
    }
    const [rows] = await pool.query(`SELECT * FROM members WHERE id=:id`, { id: req.params.id });
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
