const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/kpis', auth(), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const [[m]] = await pool.query('SELECT COUNT(*) AS c FROM members WHERE org_id=:orgId AND status="active"', { orgId });
    const [[f]] = await pool.query('SELECT COUNT(*) AS c FROM members WHERE org_id=:orgId AND is_farmer=1 AND status="active"', { orgId });
    const [[p]] = await pool.query(
      `SELECT COUNT(*) AS active_loans, COALESCE(SUM(outstanding),0) AS portfolio
       FROM loans WHERE org_id=:orgId AND status IN ('active','disbursed')`,
      { orgId }
    );
    const [[par]] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN par_bucket!='current' THEN outstanding ELSE 0 END),0) AS par_os,
              COALESCE(SUM(outstanding),0) AS total
       FROM loans WHERE org_id=:orgId AND status IN ('active','disbursed')`,
      { orgId }
    );
    const total = Number(par.total) || 0;
    res.json({
      totalMembers: m.c,
      farmers: f.c,
      activeLoans: p.active_loans,
      portfolioOutstanding: Number(p.portfolio),
      par30ApproxPct: total ? (Number(par.par_os) / total) * 100 : 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
