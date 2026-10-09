const express = require('express');
const { auth } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const pool = require('../config/db');
const router = express.Router();
const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';

function orgCode(req) {
  return req.user.orgCode || req.user.orgId || '001';
}

router.get('/portfolio', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      return res.json(await legacy.portfolio({ orgCode: orgCode(req), vacCode: req.query.vacCode }));
    }
    res.json({});
  } catch (e) {
    next(e);
  }
});

router.get('/products', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const [rows] = await pool.query(
        `SELECT product_code AS code, product_code AS name FROM tbl_loanproduct WHERE por_orgacode=:o LIMIT 100`,
        { o: orgCode(req) }
      );
      return res.json(rows);
    }
    const [rows] = await pool.query(`SELECT * FROM loan_products WHERE org_id=:id`, {
      id: req.user.orgId,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      return res.json(
        await legacy.listLoans({
          orgCode: orgCode(req),
          vacCode: req.query.vacCode || req.user.vacCode,
        })
      );
    }
    const [rows] = await pool.query(`SELECT * FROM loans WHERE org_id=:id LIMIT 200`, {
      id: req.user.orgId,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
