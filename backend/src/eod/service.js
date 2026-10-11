const pool = require('../config/db');

function org(req) {
  return String(req.user?.orgCode || req.user?.orgId || '001');
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function ensureCalendar(orgCode) {
  const [[row]] = await pool.query(`SELECT * FROM eod_calendar WHERE por_orgacode = :o`, { o: orgCode });
  if (row) return row;
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO eod_calendar (por_orgacode, business_date, status) VALUES (:o, :d, 'open')`,
    { o: orgCode, d: today }
  );
  const [[r2]] = await pool.query(`SELECT * FROM eod_calendar WHERE por_orgacode = :o`, { o: orgCode });
  return r2;
}

async function status(orgCode) {
  const cal = await ensureCalendar(orgCode);
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
  const [recent] = await pool.query(
    `SELECT * FROM eod_runs WHERE por_orgacode = :o ORDER BY id DESC LIMIT 10`,
    { o: orgCode }
  );
  return {
    business_date: cal.business_date,
    status: cal.status,
    last_eod_at: cal.last_eod_at,
    last_eod_by: cal.last_eod_by,
    unposted_transactions: unposted,
    legacy_note: legacyNote,
    recent_runs: recent,
    checklist: [
      { code: 'CUTOFF', label: 'Confirm business date / cut-off', required: true },
      { code: 'UNPOSTED', label: 'Clear or post pending transactions', required: true },
      { code: 'ACCRUAL', label: 'Run interest accrual (if applicable)', required: false },
      { code: 'LEDGER', label: 'Legacy day-end / GL close step', required: false },
      { code: 'CLOSE', label: 'Close day and open next business date', required: true },
    ],
  };
}

/**
 * Full EOD pipeline
 * body: { business_date?, skip_accrual?, notes?, vac_code?, interest_gl?, income_gl? }
 */
async function runEod(orgCode, userId, body = {}) {
  const cal = await ensureCalendar(orgCode);
  const bizDate = (body.business_date || cal.business_date || new Date().toISOString().slice(0, 10)).toString().slice(0, 10);

  if (cal.status === 'closed' && String(cal.business_date).slice(0, 10) === bizDate) {
    const err = new Error('This business date is already closed. Open next day or pick another date.');
    err.status = 400;
    throw err;
  }

  await pool.query(`UPDATE eod_calendar SET status = 'closing' WHERE por_orgacode = :o`, { o: orgCode });

  const steps = [];
  let overall = 'success';

  // 1. Cut-off recorded
  steps.push({ code: 'CUTOFF', ok: true, detail: `Business date ${bizDate}` });

  // 2. Unposted check (legacy)
  try {
    if (process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1') {
      const posting = require('../legacy/posting');
      const c = await posting.unpostedCount(orgCode, body.vac_code || null);
      const ok = c === 0 || body.allow_unposted === true;
      steps.push({ code: 'UNPOSTED', ok, detail: `Unposted count: ${c}` });
      if (!ok) {
        overall = 'failed';
        await pool.query(`UPDATE eod_calendar SET status = 'open' WHERE por_orgacode = :o`, { o: orgCode });
        const err = new Error(`Cannot close day: ${c} unposted transaction(s). Post them or pass allow_unposted.`);
        err.status = 400;
        err.steps = steps;
        throw err;
      }
    } else {
      steps.push({ code: 'UNPOSTED', ok: true, detail: 'Skipped (native mode)' });
    }
  } catch (e) {
    if (e.status === 400) throw e;
    steps.push({ code: 'UNPOSTED', ok: false, detail: e.message });
    overall = 'partial';
  }

  // 3. Accrual
  if (body.skip_accrual) {
    steps.push({ code: 'ACCRUAL', ok: true, detail: 'Skipped by user' });
  } else {
    try {
      if (process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1') {
        const posting = require('../legacy/posting');
        const acc = await posting.accrueInterest({
          orgCode,
          vacCode: body.vac_code,
          asOfDate: bizDate,
          days: body.days || 1,
          interestGl: body.interest_gl,
          incomeGl: body.income_gl,
          createJournal: body.create_journal !== false,
        });
        steps.push({ code: 'ACCRUAL', ok: true, detail: acc });
      } else {
        steps.push({ code: 'ACCRUAL', ok: true, detail: 'Native mode: accrual hook ready (configure products)' });
      }
    } catch (e) {
      steps.push({ code: 'ACCRUAL', ok: false, detail: e.message });
      overall = overall === 'failed' ? 'failed' : 'partial';
    }
  }

  // 4. Legacy day-end posting
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
      steps.push({ code: 'LEDGER', ok: true, detail: 'Native mode: GL period close marker only' });
    }
  } catch (e) {
    steps.push({ code: 'LEDGER', ok: false, detail: e.message });
    overall = overall === 'failed' ? 'failed' : 'partial';
  }

  // 5. Close day + roll business date
  const nextDate = body.next_business_date || addDays(bizDate, 1);
  try {
    await pool.query(
      `UPDATE eod_calendar
       SET business_date = :next, status = 'open', last_eod_at = NOW(), last_eod_by = :by
       WHERE por_orgacode = :o`,
      { next: nextDate, by: String(userId || '').slice(0, 50), o: orgCode }
    );
    steps.push({
      code: 'CLOSE',
      ok: true,
      detail: `Closed ${bizDate}; next business date ${nextDate}`,
    });
  } catch (e) {
    steps.push({ code: 'CLOSE', ok: false, detail: e.message });
    overall = 'failed';
    await pool.query(`UPDATE eod_calendar SET status = 'open' WHERE por_orgacode = :o`, { o: orgCode });
  }

  const [ins] = await pool.query(
    `INSERT INTO eod_runs (por_orgacode, business_date, run_at, run_by, status, steps_json, notes, next_business_date)
     VALUES (:o, :bd, NOW(), :by, :st, :steps, :notes, :next)`,
    {
      o: orgCode,
      bd: bizDate,
      by: String(userId || '').slice(0, 50),
      st: overall,
      steps: JSON.stringify(steps),
      notes: body.notes || null,
      next: nextDate,
    }
  );

  return {
    ok: overall !== 'failed',
    status: overall,
    business_date_closed: bizDate,
    next_business_date: nextDate,
    run_id: ins.insertId,
    steps,
  };
}

async function setBusinessDate(orgCode, date, userId) {
  await ensureCalendar(orgCode);
  await pool.query(
    `UPDATE eod_calendar SET business_date = :d, status = 'open' WHERE por_orgacode = :o`,
    { d: date, o: orgCode }
  );
  return status(orgCode);
}

module.exports = { org, status, runEod, setBusinessDate, ensureCalendar };
