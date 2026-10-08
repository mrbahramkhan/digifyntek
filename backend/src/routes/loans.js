const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

function bucket(dpd) {
  if (dpd >= 90) return 'd90';
  if (dpd >= 60) return 'd60';
  if (dpd >= 30) return 'd30';
  return 'current';
}
function classification(dpd) {
  if (dpd >= 180) return 'loss';
  if (dpd >= 90) return 'doubtful';
  if (dpd >= 60) return 'substandard';
  if (dpd >= 30) return 'oa';
  return 'performing';
}

router.get('/portfolio', auth(), async (req, res) => {
  try {
    const orgId = req.query.orgId || req.user.orgId;
    const [rows] = await pool.query(
      `SELECT * FROM v_portfolio_summary WHERE org_id = :orgId`,
      { orgId }
    );
    const s = rows[0] || { active_loans: 0, portfolio_outstanding: 0, current_os: 0, par30_os: 0, par60_os: 0, par90_os: 0 };
    const os = Number(s.portfolio_outstanding) || 0;
    res.json({
      ...s,
      par30_pct: os ? (Number(s.par30_os) + Number(s.par60_os) + Number(s.par90_os)) / os * 100 : 0,
      par90_pct: os ? Number(s.par90_os) / os * 100 : 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', auth(), async (req, res) => {
  try {
    const orgId = req.query.orgId || req.user.orgId;
    const [rows] = await pool.query(
      `SELECT l.*, m.full_name AS member_name, m.cnic, p.name AS product_name
       FROM loans l
       JOIN members m ON m.id = l.member_id
       JOIN loan_products p ON p.id = l.product_id
       WHERE l.org_id = :orgId
       ORDER BY l.id DESC LIMIT 500`,
      { orgId }
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', auth(), async (req, res) => {
  try {
    const b = req.body;
    const orgId = b.org_id || req.user.orgId;
    // Simple MCL: outstanding + new principal vs shares * face * multiplier (e.g. 10x)
    const [[folio]] = await pool.query(
      'SELECT COALESCE(SUM(shares * face_value),0) AS capital FROM share_folios WHERE member_id=:mid AND status="active"',
      { mid: b.member_id }
    );
    const [[ex]] = await pool.query(
      'SELECT COALESCE(SUM(outstanding),0) AS os FROM loans WHERE member_id=:mid AND status IN ("active","disbursed")',
      { mid: b.member_id }
    );
    const capital = Number(folio.capital) || 0;
    const mclLimit = capital * 10; // policy placeholder
    const mcl_ok = Number(ex.os) + Number(b.principal) <= mclLimit || capital === 0;

    const loanNumber = b.loan_number || `LN-${Date.now().toString().slice(-8)}`;
    const [r] = await pool.query(
      `INSERT INTO loans (org_id, vac_id, member_id, product_id, loan_number, mode, principal, outstanding, profit_or_interest, status, mcl_ok, underlying_asset)
       VALUES (:org_id, :vac_id, :member_id, :product_id, :loan_number, :mode, :principal, :principal, :profit, 'pending_approval', :mcl_ok, :underlying)`,
      {
        org_id: orgId,
        vac_id: b.vac_id,
        member_id: b.member_id,
        product_id: b.product_id,
        loan_number: loanNumber,
        mode: b.mode || 'conventional',
        principal: b.principal,
        profit: b.profit_or_interest || 0,
        mcl_ok: mcl_ok ? 1 : 0,
        underlying: b.underlying_asset || null,
      }
    );
    res.status(201).json({ id: r.insertId, loan_number: loanNumber, mcl_ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', auth(), async (req, res) => {
  try {
    await pool.query(`UPDATE loans SET status='approved' WHERE id=:id`, { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/disburse', auth(), async (req, res) => {
  try {
    await pool.query(
      `UPDATE loans SET status='active', disbursed_at=CURDATE() WHERE id=:id`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/repay', auth(), async (req, res) => {
  try {
    const { amount, method, receipt_no } = req.body;
    const loanId = req.params.id;
    await pool.query(
      `INSERT INTO loan_repayments (loan_id, amount, paid_at, method, receipt_no, created_by)
       VALUES (:loanId, :amount, CURDATE(), :method, :receipt_no, :uid)`,
      { loanId, amount, method: method || 'cash', receipt_no: receipt_no || null, uid: req.user.id }
    );
    await pool.query(
      `UPDATE loans SET outstanding = GREATEST(0, outstanding - :amount),
        status = IF(outstanding - :amount <= 0, 'settled', status)
       WHERE id = :loanId`,
      { amount, loanId }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/refresh-par', auth(), async (req, res) => {
  try {
    // Recompute DPD from oldest unpaid schedule due_date
    const [loans] = await pool.query(`SELECT id FROM loans WHERE status IN ('active','disbursed')`);
    for (const l of loans) {
      const [sch] = await pool.query(
        `SELECT MIN(DATEDIFF(CURDATE(), due_date)) AS dpd FROM loan_schedules
         WHERE loan_id=:id AND status IN ('pending','partial','overdue') AND due_date < CURDATE()`,
        { id: l.id }
      );
      let dpd = sch[0]?.dpd != null ? Number(sch[0].dpd) : 0;
      if (dpd < 0) dpd = 0;
      await pool.query(
        `UPDATE loans SET days_past_due=:dpd, par_bucket=:bucket, classification=:cls WHERE id=:id`,
        { dpd, bucket: bucket(dpd), cls: classification(dpd), id: l.id }
      );
    }
    res.json({ ok: true, refreshed: loans.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/products', auth(), async (req, res) => {
  try {
    const orgId = req.query.orgId || req.user.orgId;
    const [rows] = await pool.query('SELECT * FROM loan_products WHERE org_id=:orgId AND is_active=1', { orgId });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
