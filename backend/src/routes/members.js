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
    try {
      const [rows] = await pool.query(`SELECT * FROM cbs_members ORDER BY id DESC LIMIT 200`);
      if (rows.length) return res.json(rows);
    } catch (_) {}
    try {
      const [rows] = await pool.query(
        `SELECT * FROM members WHERE org_id = :orgId ORDER BY id DESC LIMIT 200`,
        { orgId: req.user.orgId }
      );
      return res.json(rows);
    } catch (e2) {
      return res.json([]);
    }
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


router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.full_name || b.name || '').trim();
    const cnic = String(b.cnic || '').replace(/\D/g, '');
    const phone = String(b.phone || b.mobile || '').replace(/\D/g, '');
    if (!name || name.length < 3) return res.status(400).json({ error: 'full_name required' });
    if (!cnic || cnic.length !== 13) return res.status(400).json({ error: 'CNIC must be 13 digits' });
    if (!phone || phone.length < 10) return res.status(400).json({ error: 'mobile/phone required' });
    const shares = Number(b.share_units != null ? b.share_units : b.shares || 1);
    if (!(shares >= 1)) return res.status(400).json({ error: 'share_units minimum 1' });

    // Prefer CBS-style table if present
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS cbs_members (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          member_no VARCHAR(40) NULL,
          full_name VARCHAR(160) NOT NULL,
          cnic VARCHAR(20) NOT NULL,
          father_or_husband VARCHAR(160) NULL,
          phone VARCHAR(30) NULL,
          address VARCHAR(255) NULL,
          branch_code VARCHAR(20) NULL,
          member_type VARCHAR(40) NULL DEFAULT 'regular',
          share_units INT NOT NULL DEFAULT 1,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_mem_cnic (cnic)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      // duplicate CNIC check
      const [[dup]] = await pool.query(`SELECT id FROM cbs_members WHERE cnic = ? LIMIT 1`, [cnic]);
      if (dup) return res.status(409).json({ error: 'Member with this CNIC already exists' });
      const memberNo = b.member_no || ('M' + Date.now().toString().slice(-8));
      const [ins] = await pool.query(
        `INSERT INTO cbs_members
          (member_no, full_name, cnic, father_or_husband, phone, address, branch_code, member_type, share_units, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          memberNo,
          name,
          cnic,
          b.father_or_husband || null,
          phone,
          b.address || null,
          b.branch_code || '001',
          b.member_type || 'regular',
          shares,
        ]
      );
      const [[row]] = await pool.query(`SELECT * FROM cbs_members WHERE id = ?`, [ins.insertId]);
      return res.status(201).json(row);
    } catch (e) {
      // legacy members table
      try {
        const [ins] = await pool.query(
          `INSERT INTO members (org_id, full_name, cnic, phone, status)
           VALUES (?, ?, ?, ?, 'active')`,
          [req.user.orgId || 1, name, cnic, phone]
        );
        return res.status(201).json({ id: ins.insertId, full_name: name, cnic });
      } catch (e2) {
        return res.status(500).json({ error: e2.message || e.message });
      }
    }
  } catch (e) {
    next(e);
  }
});


module.exports = router;
