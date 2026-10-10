const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';

function orgCode(req) {
  return String(req.user.orgCode || req.user.orgId || '001');
}

/** Synthetic instruments from legacy loan / share / guarantee / deposit tables */
async function listLegacyInstruments(orgCode, { type, status, q } = {}) {
  const out = [];

  // Loan agreements
  if (!type || type === 'loan_agreement') {
    const [loans] = await pool.query(
      `SELECT la.account_no, la.farmer_no, la.loan_disbursementamount, la.loan_disbursementdate,
              la.account_closed, la.account_balance, la.vac_code, f.farmer_name, f.farmer_cnic_no
       FROM tbl_loanaccount la
       LEFT JOIN tbl_farmer f ON f.farmer_no = la.farmer_no AND f.por_orgacode = la.por_orgacode
       WHERE la.por_orgacode = :org
       ORDER BY la.loan_disbursementdate DESC LIMIT 300`,
      { org: orgCode }
    );
    for (const r of loans) {
      const st = r.account_closed ? 'settled' : Number(r.account_balance) > 0 ? 'active' : 'settled';
      out.push({
        id: `LA-${r.account_no}`,
        instrument_no: `LA-${r.account_no}`,
        inst_type: 'loan_agreement',
        member_id: r.farmer_no,
        full_name: r.farmer_name,
        cnic: r.farmer_cnic_no,
        linked_ref: r.account_no,
        amount_or_shares: Number(r.loan_disbursementamount),
        outstanding: Number(r.account_balance),
        issue_date: r.loan_disbursementdate,
        status: st,
        vac_code: r.vac_code,
        source: 'legacy_loan',
      });
    }
  }

  // Share certificates
  if (!type || type === 'share_certificate') {
    const [shares] = await pool.query(
      `SELECT s.farmer_no, s.farmer_share_held, s.farmer_share_value, s.farmer_total_share_value,
              f.farmer_name, f.farmer_cnic_no
       FROM tbl_farmer_share s
       LEFT JOIN tbl_farmer f ON f.farmer_no = s.farmer_no AND f.por_orgacode = s.por_orgacode
       WHERE s.por_orgacode = :org LIMIT 300`,
      { org: orgCode }
    );
    for (const r of shares) {
      out.push({
        id: `SC-${r.farmer_no}`,
        instrument_no: `SC-${r.farmer_no}`,
        inst_type: 'share_certificate',
        member_id: r.farmer_no,
        full_name: r.farmer_name,
        cnic: r.farmer_cnic_no,
        linked_ref: `${r.farmer_share_held} shares`,
        amount_or_shares: Number(r.farmer_total_share_value),
        issue_date: null,
        status: 'active',
        source: 'legacy_share',
      });
    }
  }

  // Guarantees
  if (!type || type === 'guarantee') {
    const [gus] = await pool.query(
      `SELECT g.account_no, g.loan_guarantornic, g.loan_guarantorname, g.phone_no
       FROM tbl_loanguarantor g WHERE g.por_orgacode = :org LIMIT 300`,
      { org: orgCode }
    );
    for (const r of gus) {
      out.push({
        id: `GR-${r.loan_guarantornic}-${r.account_no}`,
        instrument_no: `GR-${r.loan_guarantornic}`,
        inst_type: 'guarantee',
        member_id: null,
        full_name: r.loan_guarantorname,
        cnic: r.loan_guarantornic,
        linked_ref: r.account_no,
        amount_or_shares: null,
        issue_date: null,
        status: 'active',
        phone: r.phone_no,
        source: 'legacy_guarantee',
      });
    }
  }

  // Deposit receipts
  if (!type || type === 'deposit_receipt') {
    const [deps] = await pool.query(
      `SELECT d.account_no, d.farmer_no, d.account_balance, d.account_opendate, d.account_closed,
              f.farmer_name, f.farmer_cnic_no
       FROM tbl_depositaccount d
       LEFT JOIN tbl_farmer f ON f.farmer_no = d.farmer_no AND f.por_orgacode = d.por_orgacode
       WHERE d.por_orgacode = :org LIMIT 300`,
      { org: orgCode }
    );
    for (const r of deps) {
      out.push({
        id: `DR-${r.account_no}`,
        instrument_no: `DR-${r.account_no}`,
        inst_type: 'deposit_receipt',
        member_id: r.farmer_no,
        full_name: r.farmer_name,
        cnic: r.farmer_cnic_no,
        linked_ref: r.account_no,
        amount_or_shares: Number(r.account_balance),
        issue_date: r.account_opendate,
        status: r.account_closed ? 'settled' : 'active',
        source: 'legacy_deposit',
      });
    }
  }

  let filtered = out;
  if (status) filtered = filtered.filter((x) => x.status === status);
  if (q) {
    const qq = String(q).toLowerCase();
    filtered = filtered.filter(
      (x) =>
        (x.instrument_no && x.instrument_no.toLowerCase().includes(qq)) ||
        (x.full_name && x.full_name.toLowerCase().includes(qq)) ||
        (x.cnic && String(x.cnic).includes(qq)) ||
        (x.linked_ref && String(x.linked_ref).toLowerCase().includes(qq))
    );
  }
  return filtered;
}

router.get('/summary', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const rows = await listLegacyInstruments(orgCode(req));
      const byType = {};
      let active = 0;
      for (const r of rows) {
        byType[r.inst_type] = (byType[r.inst_type] || 0) + 1;
        if (r.status === 'active') active++;
      }
      return res.json({ total: rows.length, active, by_type: byType });
    }
    const [rows] = await pool.query(
      `SELECT inst_type, status, COUNT(*) AS c FROM instruments
       WHERE org_id = :org GROUP BY inst_type, status`,
      { org: req.user.orgId }
    );
    res.json({ rows });
  } catch (e) {
    next(e);
  }
});

router.get('/', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const rows = await listLegacyInstruments(orgCode(req), {
        type: req.query.type,
        status: req.query.status,
        q: req.query.q || req.query.search,
      });
      return res.json(rows);
    }
    let sql = `SELECT i.*, m.full_name, m.cnic FROM instruments i
               LEFT JOIN members m ON m.id = i.member_id
               WHERE i.org_id = :orgId`;
    const params = { orgId: req.user.orgId };
    if (req.query.type) {
      sql += ` AND i.inst_type = :type`;
      params.type = req.query.type;
    }
    if (req.query.status) {
      sql += ` AND i.status = :status`;
      params.status = req.query.status;
    }
    sql += ` ORDER BY i.id DESC LIMIT 500`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const rows = await listLegacyInstruments(orgCode(req));
      const one = rows.find((r) => String(r.id) === String(req.params.id) || r.instrument_no === req.params.id);
      if (!one) return res.status(404).json({ error: 'Not found' });
      return res.json(one);
    }
    const [rows] = await pool.query(
      `SELECT i.*, m.full_name FROM instruments i
       LEFT JOIN members m ON m.id = i.member_id WHERE i.id = :id AND i.org_id = :org`,
      { id: req.params.id, org: req.user.orgId }
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      return res.status(501).json({
        error:
          'Legacy mode: instruments are derived from loans, shares, guarantees and deposits. Issue those products instead.',
      });
    }
    const b = req.body || {};
    const prefixes = {
      loan_agreement: 'LA',
      share_certificate: 'SC',
      guarantee: 'GR',
      deposit_receipt: 'DR',
    };
    const no = b.instrument_no || `${prefixes[b.inst_type] || 'IN'}-${Date.now().toString().slice(-6)}`;
    const [r] = await pool.query(
      `INSERT INTO instruments
        (org_id, instrument_no, inst_type, member_id, loan_id, folio_id, amount_or_shares, issue_date, status, doc_url, notes)
       VALUES
        (:org_id, :no, :inst_type, :member_id, :loan_id, :folio_id, :amount, :issue_date, :status, :doc_url, :notes)`,
      {
        org_id: req.user.orgId,
        no,
        inst_type: b.inst_type,
        member_id: b.member_id || null,
        loan_id: b.loan_id || null,
        folio_id: b.folio_id || null,
        amount: b.amount_or_shares || null,
        issue_date: b.issue_date || new Date().toISOString().slice(0, 10),
        status: b.status || 'active',
        doc_url: b.doc_url || null,
        notes: b.notes || null,
      }
    );
    res.status(201).json({ id: r.insertId, instrument_no: no });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/status', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      return res.status(501).json({
        error: 'Legacy mode: change status on the underlying loan/deposit/share record.',
      });
    }
    const status = req.body && req.body.status;
    const allowed = ['draft', 'active', 'settled', 'cancelled', 'written_off'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await pool.query(`UPDATE instruments SET status = :status WHERE id = :id AND org_id = :org`, {
      status,
      id: req.params.id,
      org: req.user.orgId,
    });
    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
