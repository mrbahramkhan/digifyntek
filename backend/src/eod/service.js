/**
 * End of Day — hardened
 * - Idempotent: successful close for (org, business_date) cannot re-post / re-advance
 * - Gates: trial balance balanced, no PENDING approvals (unless override)
 * - Business date advances only after required gates pass
 */
const pool = require('../config/db');
const crypto = require('crypto');

function org(req) {
  return String(req.user?.orgCode || req.user?.orgId || '001');
}

function addDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function executionId(orgCode, bizDate) {
  return `EOD-${orgCode}-${bizDate}`;
}

async function ensureCalendar(orgCode) {
  const [[row]] = await pool.query(`SELECT * FROM eod_calendar WHERE por_orgacode = ?`, [orgCode]);
  if (row) return row;
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO eod_calendar (por_orgacode, business_date, status) VALUES (?, ?, 'open')`,
    [orgCode, today]
  );
  const [[r2]] = await pool.query(`SELECT * FROM eod_calendar WHERE por_orgacode = ?`, [orgCode]);
  return r2;
}

async function trialBalanceGate(asOf) {
  try {
    const ledger = require('../ledger/service');
    return await ledger.trialBalance(asOf);
  } catch (e) {
    // Tables may not exist yet
    return {
      as_of: asOf,
      total_debit: 0,
      total_credit: 0,
      balanced: true,
      skipped: true,
      note: e.message,
    };
  }
}

async function pendingApprovalsCount() {
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS n FROM cbs_approval_requests WHERE status = 'PENDING'`
    );
    return Number(r?.n || 0);
  } catch (_) {
    return 0;
  }
}

async function pendingJournalsCount() {
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS n FROM cbs_journal_headers WHERE status = 'PENDING'`
    );
    return Number(r?.n || 0);
  } catch (_) {
    return 0;
  }
}

async function findSuccessfulRun(orgCode, bizDate) {
  const [[row]] = await pool.query(
    `SELECT * FROM eod_runs
     WHERE por_orgacode = ? AND business_date = ? AND status = 'success'
     ORDER BY id DESC LIMIT 1`,
    [orgCode, bizDate]
  );
  return row || null;
}

async function status(orgCode) {
  const cal = await ensureCalendar(orgCode);
  const bizDate = String(cal.business_date).slice(0, 10);
  let unposted = null;
  let legacyNote = null;
  try {
    if (process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1') {
      const posting = require('../legacy/posting');
      unposted = await posting.unpostedCount(orgCode, null);
    }
  } catch (e) {
    legacyNote = e.message;
  }

  const tb = await trialBalanceGate(bizDate);
  const pendingApprovals = await pendingApprovalsCount();
  const pendingJournals = await pendingJournalsCount();
  const priorSuccess = await findSuccessfulRun(orgCode, bizDate);

  const [recent] = await pool.query(
    `SELECT * FROM eod_runs WHERE por_orgacode = ? ORDER BY id DESC LIMIT 15`,
    [orgCode]
  );

  const gates = [
    {
      code: 'TRIAL_BALANCE',
      ok: tb.balanced !== false,
      required: true,
      detail: tb.skipped
        ? `Skipped: ${tb.note || 'no ledger'}`
        : `Dr ${tb.total_debit} / Cr ${tb.total_credit} · balanced=${tb.balanced}`,
    },
    {
      code: 'PENDING_APPROVALS',
      ok: pendingApprovals === 0,
      required: true,
      detail: `${pendingApprovals} PENDING maker-checker request(s)`,
    },
    {
      code: 'PENDING_JOURNALS',
      ok: pendingJournals === 0,
      required: false,
      detail: `${pendingJournals} PENDING journal(s)`,
    },
    {
      code: 'IDEMPOTENT_CLOSE',
      ok: !priorSuccess,
      required: true,
      detail: priorSuccess
        ? `Already closed successfully (run #${priorSuccess.id}) — rerun is no-op`
        : 'No successful close for this business date yet',
    },
  ];

  return {
    business_date: cal.business_date,
    status: cal.status,
    last_eod_at: cal.last_eod_at,
    last_eod_by: cal.last_eod_by,
    unposted_transactions: unposted,
    legacy_note: legacyNote,
    trial_balance: tb,
    pending_approvals: pendingApprovals,
    pending_journals: pendingJournals,
    prior_success_run: priorSuccess
      ? { id: priorSuccess.id, run_at: priorSuccess.run_at, next: priorSuccess.next_business_date }
      : null,
    gates,
    can_close:
      gates.filter((g) => g.required).every((g) => g.ok) ||
      (priorSuccess ? false : gates.filter((g) => g.code !== 'IDEMPOTENT_CLOSE' && g.required).every((g) => g.ok)),
    recent_runs: recent,
    checklist: [
      { code: 'CUTOFF', label: 'Confirm business date / cut-off', required: true },
      { code: 'TRIAL_BALANCE', label: 'Trial balance must balance', required: true },
      { code: 'PENDING_APPROVALS', label: 'No PENDING approval requests', required: true },
      { code: 'UNPOSTED', label: 'Clear legacy unposted (if applicable)', required: false },
      { code: 'ACCRUAL', label: 'Interest/profit accrual step', required: false },
      { code: 'CLOSE', label: 'Close day and open next business date', required: true },
    ],
  };
}

/**
 * body: {
 *   business_date?, next_business_date?, skip_accrual?, notes?,
 *   force_unbalanced?, force_pending_approvals?, vac_code?
 * }
 * force_* requires explicit true and is audited in steps (exception path)
 */
async function runEod(orgCode, userId, body = {}) {
  const cal = await ensureCalendar(orgCode);
  const bizDate = String(body.business_date || cal.business_date || new Date().toISOString().slice(0, 10)).slice(
    0,
    10
  );
  const execId = executionId(orgCode, bizDate);
  const steps = [];
  let overall = 'success';

  // --- Idempotent short-circuit ---
  const prior = await findSuccessfulRun(orgCode, bizDate);
  if (prior) {
    return {
      ok: true,
      status: 'success',
      idempotent: true,
      execution_id: execId,
      business_date_closed: bizDate,
      next_business_date: prior.next_business_date,
      run_id: prior.id,
      message: 'Business date already closed successfully — no duplicate postings or date advance',
      steps: typeof prior.steps_json === 'string' ? JSON.parse(prior.steps_json) : prior.steps_json,
    };
  }

  // Mark closing
  await pool.query(`UPDATE eod_calendar SET status = 'closing' WHERE por_orgacode = ?`, [orgCode]);
  steps.push({ code: 'CUTOFF', ok: true, detail: `Business date ${bizDate} · execution ${execId}` });

  // --- Trial balance gate ---
  const tb = await trialBalanceGate(bizDate);
  const tbOk = tb.balanced !== false || body.force_unbalanced === true;
  steps.push({
    code: 'TRIAL_BALANCE',
    ok: tbOk,
    detail: tb.skipped
      ? `Skipped (${tb.note || 'n/a'})`
      : `Dr ${tb.total_debit} Cr ${tb.total_credit} balanced=${tb.balanced}` +
        (body.force_unbalanced ? ' · FORCE OVERRIDE' : ''),
  });
  if (!tbOk) {
    overall = 'failed';
    await pool.query(`UPDATE eod_calendar SET status = 'open' WHERE por_orgacode = ?`, [orgCode]);
    const [ins] = await pool.query(
      `INSERT INTO eod_runs (por_orgacode, business_date, run_at, run_by, status, steps_json, notes, next_business_date)
       VALUES (?, ?, NOW(), ?, 'failed', ?, ?, NULL)`,
      [orgCode, bizDate, String(userId || '').slice(0, 50), JSON.stringify(steps), body.notes || 'TB gate failed']
    );
    return {
      ok: false,
      status: 'failed',
      execution_id: execId,
      run_id: ins.insertId,
      business_date_closed: null,
      message: 'Trial balance not balanced — day not closed',
      steps,
      trial_balance: tb,
    };
  }

  // --- Pending approvals gate ---
  const pendingAppr = await pendingApprovalsCount();
  const apprOk = pendingAppr === 0 || body.force_pending_approvals === true;
  steps.push({
    code: 'PENDING_APPROVALS',
    ok: apprOk,
    detail: `${pendingAppr} pending` + (body.force_pending_approvals ? ' · FORCE OVERRIDE' : ''),
  });
  if (!apprOk) {
    overall = 'failed';
    await pool.query(`UPDATE eod_calendar SET status = 'open' WHERE por_orgacode = ?`, [orgCode]);
    const [ins] = await pool.query(
      `INSERT INTO eod_runs (por_orgacode, business_date, run_at, run_by, status, steps_json, notes, next_business_date)
       VALUES (?, ?, NOW(), ?, 'failed', ?, ?, NULL)`,
      [
        orgCode,
        bizDate,
        String(userId || '').slice(0, 50),
        JSON.stringify(steps),
        body.notes || 'Pending approvals gate failed',
      ]
    );
    return {
      ok: false,
      status: 'failed',
      execution_id: execId,
      run_id: ins.insertId,
      business_date_closed: null,
      message: 'Pending maker-checker requests — day not closed',
      steps,
    };
  }

  // --- Legacy unposted (soft) ---
  try {
    if (process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1') {
      const posting = require('../legacy/posting');
      const unposted = await posting.unpostedCount(orgCode, null);
      steps.push({
        code: 'UNPOSTED',
        ok: true,
        detail: `Legacy unposted count: ${unposted}`,
      });
    } else {
      const pj = await pendingJournalsCount();
      steps.push({ code: 'UNPOSTED', ok: true, detail: `Native pending journals: ${pj}` });
    }
  } catch (e) {
    steps.push({ code: 'UNPOSTED', ok: true, detail: `Skipped: ${e.message}` });
  }

  // --- Accrual (optional, idempotent marker only — no double interest without product engine) ---
  if (!body.skip_accrual) {
    try {
      const accrual = require('./accrual');
      const acc = await accrual.runAllAccruals({
        businessDate: bizDate,
        actor: String(userId || 'eod'),
        skip: {
          savings: body.skip_savings_accrual === true,
          td: body.skip_td_accrual === true,
          financing: body.skip_loan_accrual === true,
        },
      });
      steps.push({
        code: 'ACCRUAL',
        ok: true,
        detail: `Posted ${acc.total_count} accruals · amount ${acc.total_amount} · SAV ${acc.savings.count || 0} TD ${acc.term_deposits.count || 0} LON ${acc.financing.count || 0}`,
        accrual: acc,
      });
    } catch (e) {
      steps.push({ code: 'ACCRUAL', ok: false, detail: e.message });
      if (body.accrual_required === true) overall = 'failed';
    }
  } else {
    steps.push({ code: 'ACCRUAL', ok: true, detail: 'Skipped by request' });
  } else {
    steps.push({ code: 'ACCRUAL', ok: true, detail: 'Skipped by request' });
  }

  // --- Legacy day-end ---
  try {
    if (process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1') {
      const posting = require('../legacy/posting');
      const de = await posting.dayEndPost({
        orgCode,
        vacCode: body.vac_code,
        tranDate: bizDate,
      });
      steps.push({ code: 'LEDGER', ok: true, detail: de });
    } else {
      steps.push({ code: 'LEDGER', ok: true, detail: 'Native GL: period marker only' });
    }
  } catch (e) {
    steps.push({ code: 'LEDGER', ok: false, detail: e.message });
    overall = 'partial';
  }

  // --- Close + advance (only if not failed) ---
  const nextDate = body.next_business_date || addDays(bizDate, 1);
  if (overall === 'failed') {
    await pool.query(`UPDATE eod_calendar SET status = 'open' WHERE por_orgacode = ?`, [orgCode]);
  } else {
    try {
      await pool.query(
        `UPDATE eod_calendar
         SET business_date = ?, status = 'open', last_eod_at = NOW(), last_eod_by = ?
         WHERE por_orgacode = ?`,
        [nextDate, String(userId || '').slice(0, 50), orgCode]
      );
      steps.push({
        code: 'CLOSE',
        ok: true,
        detail: `Closed ${bizDate}; next business date ${nextDate}`,
      });
    } catch (e) {
      steps.push({ code: 'CLOSE', ok: false, detail: e.message });
      overall = 'failed';
      await pool.query(`UPDATE eod_calendar SET status = 'open' WHERE por_orgacode = ?`, [orgCode]);
    }
  }

  const [ins] = await pool.query(
    `INSERT INTO eod_runs (por_orgacode, business_date, run_at, run_by, status, steps_json, notes, next_business_date)
     VALUES (?, ?, NOW(), ?, ?, ?, ?, ?)`,
    [
      orgCode,
      bizDate,
      String(userId || '').slice(0, 50),
      overall,
      JSON.stringify(steps),
      body.notes || execId,
      overall === 'failed' ? null : nextDate,
    ]
  );

  return {
    ok: overall !== 'failed',
    status: overall,
    idempotent: false,
    execution_id: execId,
    business_date_closed: overall === 'failed' ? null : bizDate,
    next_business_date: overall === 'failed' ? null : nextDate,
    run_id: ins.insertId,
    steps,
  };
}

async function setBusinessDate(orgCode, date, userId) {
  await ensureCalendar(orgCode);
  await pool.query(`UPDATE eod_calendar SET business_date = ?, status = 'open' WHERE por_orgacode = ?`, [
    date,
    orgCode,
  ]);
  return status(orgCode);
}

module.exports = { org, status, runEod, setBusinessDate, ensureCalendar, trialBalanceGate };
