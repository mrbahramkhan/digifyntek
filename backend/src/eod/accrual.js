/**
 * EOD Accrual Engine (standard banking practice)
 *
 * Convention:
 *  - Day count: Actual/365 (simple daily)
 *  - Idempotent per (source_module, source_ref / idempotency_key) for a business date
 *
 * Deposits (CASA / Savings):
 *  Dr 5000 Interest expense
 *  Cr 2000 Customer deposit liability (capitalized to account balance)
 *
 * Term deposits:
 *  Dr 5000 Interest expense
 *  Cr 2200 Interest payable on TD
 *  + increase interest_accrued on TD contract
 *
 * Loans / conventional financing:
 *  Dr 1100 Interest receivable (asset)
 *  Cr 4000 Interest income
 *  + increase interest_accrued on contract (does NOT inflate principal outstanding)
 *
 * Islamic financing:
 *  Dr 1100 Financing asset
 *  Cr 4100 Profit income
 *
 * Islamic TD:
 *  Dr 5100 Profit expense
 *  Cr 2200 Profit payable
 */
const pool = require('../config/db');
const ledger = require('../ledger/service');

const YEAR_DAYS = Number(process.env.ACCRUAL_YEAR_DAYS) || 365;

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** Simple interest for `days` on Actual/365 (or ACCRUAL_YEAR_DAYS) */
function simpleDailyInterest(principal, ratePct, days = 1, yearDays = YEAR_DAYS) {
  const p = money(principal);
  const r = Number(ratePct) || 0;
  if (p <= 0 || r <= 0 || days <= 0) return 0;
  return money((p * r * days) / (100 * yearDays));
}

async function ensureAccrualSupport() {
  const alters = [
    `CREATE TABLE IF NOT EXISTS cbs_accrual_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      business_date DATE NOT NULL,
      book VARCHAR(24) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      rate_pct DECIMAL(8,4) NULL,
      journal_id BIGINT UNSIGNED NULL,
      source_ref VARCHAR(80) NOT NULL,
      created_by VARCHAR(50) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_accrual (business_date, source_ref),
      KEY idx_accrual_date (business_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `ALTER TABLE cbs_financing_contracts ADD COLUMN interest_accrued DECIMAL(18,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE cbs_financing_contracts ADD COLUMN interest_income_accrued DECIMAL(18,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE cbs_accounts ADD COLUMN interest_accrued DECIMAL(18,2) NOT NULL DEFAULT 0`,
  ];
  for (const sql of alters) {
    try {
      await pool.query(sql);
    } catch (_) {}
  }
}

async function logAccrual({ businessDate, book, entityType, entityId, amount, ratePct, journalId, sourceRef, actor }) {
  try {
    await pool.query(
      `INSERT INTO cbs_accrual_log
        (business_date, book, entity_type, entity_id, amount, rate_pct, journal_id, source_ref, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), journal_id = VALUES(journal_id)`,
      [businessDate, book, entityType, entityId, amount, ratePct || null, journalId || null, sourceRef, actor || null]
    );
  } catch (_) {}
}

/**
 * CASA / savings accrual
 */
async function accrueSavings({ businessDate, actor, days = 1 }) {
  await ensureAccrualSupport();
  const results = { book: 'SAVINGS', count: 0, amount: 0, journals: [], skipped: 0, errors: [], method: 'Actual/365 daily capitalize' };
  let accounts = [];
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.account_no, a.ledger_balance, a.balance, a.available_balance,
              COALESCE(NULLIF(a.interest_rate, 0), p.interest_rate, 0) AS interest_rate,
              a.product_code
       FROM cbs_accounts a
       LEFT JOIN cbs_products p ON p.product_code = a.product_code
       WHERE COALESCE(a.status,'active') = 'active'
         AND COALESCE(NULLIF(a.interest_rate, 0), p.interest_rate, 0) > 0
         AND COALESCE(a.ledger_balance, a.balance, 0) > 0
       LIMIT 10000`
    );
    accounts = rows;
  } catch (e) {
    // fallback without a.interest_rate column
    try {
      const [rows] = await pool.query(
        `SELECT a.id, a.account_no, a.ledger_balance, a.balance, a.available_balance,
                p.interest_rate, a.product_code
         FROM cbs_accounts a
         LEFT JOIN cbs_products p ON p.product_code = a.product_code
         WHERE COALESCE(a.status,'active') = 'active'
           AND COALESCE(p.interest_rate, 0) > 0
           AND COALESCE(a.ledger_balance, a.balance, 0) > 0
         LIMIT 10000`
      );
      accounts = rows;
    } catch (e2) {
      results.errors.push(e2.message);
      return results;
    }
  }

  for (const a of accounts) {
    const bal = money(a.ledger_balance ?? a.balance ?? 0);
    const interest = simpleDailyInterest(bal, a.interest_rate, days);
    if (interest <= 0) {
      results.skipped += 1;
      continue;
    }
    const sourceRef = `ACCR-SAV-${a.id}-${businessDate}`;
    try {
      const journal = await ledger.postJournal({
        businessDate,
        sourceModule: 'EOD_ACCRUAL',
        sourceRef,
        narrative: `Savings interest accrual ${a.account_no || a.id} (${businessDate})`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '5000', debit: interest, credit: 0, narrative: 'Interest expense - deposits' },
          {
            gl_code: '2000',
            account_id: a.id,
            debit: 0,
            credit: interest,
            narrative: 'Interest credited to CASA',
          },
        ],
      });
      await pool.query(
        `UPDATE cbs_accounts
         SET ledger_balance = COALESCE(ledger_balance, balance, 0) + ?,
             available_balance = COALESCE(available_balance, balance, 0) + ?,
             balance = COALESCE(balance, 0) + ?
         WHERE id = ?`,
        [interest, interest, interest, a.id]
      );
      try {
        await pool.query(
          `UPDATE cbs_accounts SET interest_accrued = COALESCE(interest_accrued, 0) + ? WHERE id = ?`,
          [interest, a.id]
        );
      } catch (_) {}
      await logAccrual({
        businessDate,
        book: 'SAVINGS',
        entityType: 'account',
        entityId: a.id,
        amount: interest,
        ratePct: a.interest_rate,
        journalId: journal.id,
        sourceRef,
        actor,
      });
      results.count += 1;
      results.amount = money(results.amount + interest);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message || '')) results.skipped += 1;
      else results.errors.push(`${a.id}: ${e.message}`);
    }
  }
  return results;
}

/**
 * Term deposit accrual (conventional)
 */
async function accrueTermDeposits({ businessDate, actor, days = 1 }) {
  await ensureAccrualSupport();
  const results = { book: 'TD', count: 0, amount: 0, journals: [], skipped: 0, errors: [], method: 'Actual/365 daily to interest payable' };
  let rows = [];
  try {
    const [r] = await pool.query(
      `SELECT id, td_ref, principal, outstanding_principal, rate_pct, interest_accrued, status
       FROM cbs_term_deposits
       WHERE status = 'active' AND COALESCE(rate_pct, 0) > 0
         AND COALESCE(is_islamic, 0) = 0
       LIMIT 10000`
    );
    rows = r;
  } catch (e) {
    results.errors.push(e.message);
    return results;
  }

  for (const td of rows) {
    const p = money(td.outstanding_principal ?? td.principal);
    const interest = simpleDailyInterest(p, td.rate_pct, days);
    if (interest <= 0) {
      results.skipped += 1;
      continue;
    }
    const sourceRef = `ACCR-TD-${td.id}-${businessDate}`;
    try {
      const journal = await ledger.postJournal({
        businessDate,
        sourceModule: 'EOD_ACCRUAL',
        sourceRef,
        narrative: `TD interest accrual ${td.td_ref} (${businessDate})`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '5000', debit: interest, credit: 0, narrative: 'TD interest expense' },
          { gl_code: '2200', debit: 0, credit: interest, narrative: 'TD interest payable' },
        ],
      });
      await pool.query(
        `UPDATE cbs_term_deposits SET interest_accrued = COALESCE(interest_accrued, 0) + ? WHERE id = ?`,
        [interest, td.id]
      );
      try {
        await pool.query(
          `INSERT INTO cbs_td_events (td_id, event_type, amount, journal_id, note, actor)
           VALUES (?, 'ACCRUE', ?, ?, ?, ?)`,
          [td.id, interest, journal.id || null, `EOD accrual ${businessDate}`, actor]
        );
      } catch (_) {}
      await logAccrual({
        businessDate,
        book: 'TD',
        entityType: 'term_deposit',
        entityId: td.id,
        amount: interest,
        ratePct: td.rate_pct,
        journalId: journal.id,
        sourceRef,
        actor,
      });
      results.count += 1;
      results.amount = money(results.amount + interest);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message || '')) results.skipped += 1;
      else results.errors.push(`${td.td_ref}: ${e.message}`);
    }
  }
  return results;
}

/**
 * Loan / financing interest accrual (conventional)
 * Standard: receivable + income; outstanding principal unchanged
 */
async function accrueFinancing({ businessDate, actor, days = 1 }) {
  await ensureAccrualSupport();
  const results = {
    book: 'LOAN',
    count: 0,
    amount: 0,
    journals: [],
    skipped: 0,
    errors: [],
    method: 'Actual/365 daily interest receivable / income',
  };
  let rows = [];
  try {
    const [r] = await pool.query(
      `SELECT id, contract_no, principal, outstanding, rate_pct, status, interest_accrued
       FROM cbs_financing_contracts
       WHERE status = 'active' AND COALESCE(outstanding, 0) > 0
         AND COALESCE(is_islamic, 0) = 0
         AND COALESCE(rate_pct, 0) > 0
       LIMIT 10000`
    );
    rows = r;
  } catch (e) {
    try {
      const [r] = await pool.query(
        `SELECT id, contract_no, principal, outstanding, rate_pct, status
         FROM cbs_financing_contracts
         WHERE status = 'active' AND COALESCE(outstanding, 0) > 0
           AND COALESCE(is_islamic, 0) = 0
         LIMIT 10000`
      );
      rows = r;
    } catch (e2) {
      results.errors.push(e2.message);
      return results;
    }
  }

  for (const c of rows) {
    const rate = Number(c.rate_pct) || 0;
    if (rate <= 0) {
      results.skipped += 1;
      continue;
    }
    const os = money(c.outstanding);
    const interest = simpleDailyInterest(os, rate, days);
    if (interest <= 0) {
      results.skipped += 1;
      continue;
    }
    const sourceRef = `ACCR-LON-${c.id}-${businessDate}`;
    try {
      const journal = await ledger.postJournal({
        businessDate,
        sourceModule: 'EOD_ACCRUAL',
        sourceRef,
        narrative: `Loan interest accrual ${c.contract_no} (${businessDate})`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '1100', debit: interest, credit: 0, narrative: 'Interest receivable' },
          { gl_code: '4000', debit: 0, credit: interest, narrative: 'Interest income' },
        ],
      });
      try {
        await pool.query(
          `UPDATE cbs_financing_contracts
           SET interest_accrued = COALESCE(interest_accrued, 0) + ?,
               interest_income_accrued = COALESCE(interest_income_accrued, 0) + ?
           WHERE id = ?`,
          [interest, interest, c.id]
        );
      } catch (_) {
        // column may not exist
      }
      await logAccrual({
        businessDate,
        book: 'LOAN',
        entityType: 'financing',
        entityId: c.id,
        amount: interest,
        ratePct: rate,
        journalId: journal.id,
        sourceRef,
        actor,
      });
      results.count += 1;
      results.amount = money(results.amount + interest);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message || '')) results.skipped += 1;
      else results.errors.push(`${c.contract_no}: ${e.message}`);
    }
  }
  return results;
}

/**
 * Islamic financing profit accrual
 */
async function accrueIslamicFinancing({ businessDate, actor, days = 1 }) {
  await ensureAccrualSupport();
  const results = { book: 'ISL_FIN', count: 0, amount: 0, journals: [], skipped: 0, errors: [], method: 'Actual/365 profit recognition' };
  let rows = [];
  try {
    const [r] = await pool.query(
      `SELECT id, contract_no, principal, outstanding, rate_pct, status
       FROM cbs_financing_contracts
       WHERE status = 'active' AND COALESCE(is_islamic, 0) = 1 AND COALESCE(outstanding, 0) > 0
       LIMIT 10000`
    );
    rows = r;
  } catch (e) {
    results.errors.push(e.message);
    return results;
  }

  for (const c of rows) {
    const os = money(c.outstanding);
    const rate = Number(c.rate_pct) || 0;
    const profit = rate > 0 ? simpleDailyInterest(os, rate, days) : 0;
    if (profit <= 0) {
      results.skipped += 1;
      continue;
    }
    const sourceRef = `ACCR-ISLF-${c.id}-${businessDate}`;
    try {
      const journal = await ledger.postJournal({
        businessDate,
        sourceModule: 'EOD_ACCRUAL',
        sourceRef,
        narrative: `Islamic profit accrual ${c.contract_no} (${businessDate})`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '1100', debit: profit, credit: 0, narrative: 'Financing asset / receivable' },
          { gl_code: '4100', debit: 0, credit: profit, narrative: 'Islamic profit income' },
        ],
      });
      try {
        await pool.query(
          `UPDATE cbs_financing_contracts SET interest_accrued = COALESCE(interest_accrued, 0) + ? WHERE id = ?`,
          [profit, c.id]
        );
      } catch (_) {}
      await logAccrual({
        businessDate,
        book: 'ISL_FIN',
        entityType: 'financing',
        entityId: c.id,
        amount: profit,
        ratePct: rate,
        journalId: journal.id,
        sourceRef,
        actor,
      });
      results.count += 1;
      results.amount = money(results.amount + profit);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message || '')) results.skipped += 1;
      else results.errors.push(`${c.contract_no}: ${e.message}`);
    }
  }
  return results;
}

/**
 * Islamic term deposit profit accrual
 */
async function accrueIslamicTermDeposits({ businessDate, actor, days = 1 }) {
  await ensureAccrualSupport();
  const results = { book: 'ISL_TD', count: 0, amount: 0, journals: [], skipped: 0, errors: [], method: 'Actual/365 profit payable' };
  let rows = [];
  try {
    const [r] = await pool.query(
      `SELECT id, td_ref, principal, outstanding_principal, rate_pct, status
       FROM cbs_term_deposits
       WHERE status = 'active' AND COALESCE(is_islamic, 0) = 1 AND COALESCE(rate_pct, 0) > 0
       LIMIT 10000`
    );
    rows = r;
  } catch (e) {
    results.errors.push(e.message);
    return results;
  }

  for (const td of rows) {
    const p = money(td.outstanding_principal ?? td.principal);
    const profit = simpleDailyInterest(p, td.rate_pct, days);
    if (profit <= 0) {
      results.skipped += 1;
      continue;
    }
    const sourceRef = `ACCR-ISLTD-${td.id}-${businessDate}`;
    try {
      const journal = await ledger.postJournal({
        businessDate,
        sourceModule: 'EOD_ACCRUAL',
        sourceRef,
        narrative: `Islamic TD profit accrual ${td.td_ref} (${businessDate})`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '5100', debit: profit, credit: 0, narrative: 'Islamic TD profit expense' },
          { gl_code: '2200', debit: 0, credit: profit, narrative: 'Islamic TD profit payable' },
        ],
      });
      await pool.query(
        `UPDATE cbs_term_deposits SET interest_accrued = COALESCE(interest_accrued, 0) + ? WHERE id = ?`,
        [profit, td.id]
      );
      await logAccrual({
        businessDate,
        book: 'ISL_TD',
        entityType: 'term_deposit',
        entityId: td.id,
        amount: profit,
        ratePct: td.rate_pct,
        journalId: journal.id,
        sourceRef,
        actor,
      });
      results.count += 1;
      results.amount = money(results.amount + profit);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message || '')) results.skipped += 1;
      else results.errors.push(`${td.td_ref}: ${e.message}`);
    }
  }
  return results;
}

async function runAllAccruals({ businessDate, actor, skip = {}, days = 1 }) {
  const biz = businessDate || new Date().toISOString().slice(0, 10);
  await ensureAccrualSupport();
  const out = {
    business_date: biz,
    year_basis: YEAR_DAYS,
    days: days,
    savings: skip.savings ? { skipped: true } : await accrueSavings({ businessDate: biz, actor, days }),
    term_deposits: skip.td ? { skipped: true } : await accrueTermDeposits({ businessDate: biz, actor, days }),
    financing: skip.financing ? { skipped: true } : await accrueFinancing({ businessDate: biz, actor, days }),
    islamic_financing:
      skip.islamic_financing || skip.islamic
        ? { skipped: true }
        : await accrueIslamicFinancing({ businessDate: biz, actor, days }),
    islamic_term_deposits:
      skip.islamic_td || skip.islamic
        ? { skipped: true }
        : await accrueIslamicTermDeposits({ businessDate: biz, actor, days }),
  };
  out.total_amount = money(
    (out.savings.amount || 0) +
      (out.term_deposits.amount || 0) +
      (out.financing.amount || 0) +
      (out.islamic_financing.amount || 0) +
      (out.islamic_term_deposits.amount || 0)
  );
  out.total_count =
    (out.savings.count || 0) +
    (out.term_deposits.count || 0) +
    (out.financing.count || 0) +
    (out.islamic_financing.count || 0) +
    (out.islamic_term_deposits.count || 0);
  out.summary = {
    deposits_savings: out.savings.amount || 0,
    deposits_td: out.term_deposits.amount || 0,
    loans: out.financing.amount || 0,
    islamic_financing: out.islamic_financing.amount || 0,
    islamic_td: out.islamic_term_deposits.amount || 0,
    total: out.total_amount,
  };
  return out;
}

module.exports = {
  simpleDailyInterest,
  accrueSavings,
  accrueTermDeposits,
  accrueFinancing,
  accrueIslamicFinancing,
  accrueIslamicTermDeposits,
  runAllAccruals,
  ensureAccrualSupport,
};
