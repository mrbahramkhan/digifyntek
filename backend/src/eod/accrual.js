/**
 * EOD accrual engine — savings (CASA), term deposits, financing (loans)
 * Posts balanced journals via ledger service; idempotent per (business_date, source_ref).
 */
const pool = require('../config/db');
const ledger = require('../ledger/service');

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function simpleDailyInterest(principal, ratePct, days = 1, yearDays = 365) {
  const p = money(principal);
  const r = Number(ratePct) || 0;
  if (p <= 0 || r <= 0) return 0;
  return money((p * r * days) / (100 * yearDays));
}

/**
 * Accrue CASA / savings where product has interest_rate > 0
 * Dr Interest expense 5000 / Cr Customer deposits 2000 (capitalized to account)
 */
async function accrueSavings({ businessDate, actor }) {
  const results = { count: 0, amount: 0, journals: [], skipped: 0, errors: [] };
  let accounts = [];
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.account_no, a.ledger_balance, a.balance, a.available_balance,
              p.interest_rate, p.product_code
       FROM cbs_accounts a
       LEFT JOIN cbs_products p ON p.product_code = a.product_code
       WHERE COALESCE(a.status,'active') = 'active'
         AND COALESCE(p.interest_rate, 0) > 0
         AND COALESCE(a.ledger_balance, a.balance, 0) > 0
       LIMIT 5000`
    );
    accounts = rows;
  } catch (e) {
    results.errors.push(e.message);
    return results;
  }

  for (const a of accounts) {
    const bal = money(a.ledger_balance ?? a.balance ?? 0);
    const interest = simpleDailyInterest(bal, a.interest_rate, 1);
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
        narrative: `Daily savings accrual ${a.account_no || a.id}`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '5000', debit: interest, credit: 0, narrative: 'Interest expense' },
          {
            gl_code: '2000',
            account_id: a.id,
            debit: 0,
            credit: interest,
            narrative: 'Interest credited to CASA',
          },
        ],
      });
      // Update account balances
      await pool.query(
        `UPDATE cbs_accounts
         SET ledger_balance = COALESCE(ledger_balance, balance, 0) + ?,
             available_balance = COALESCE(available_balance, balance, 0) + ?,
             balance = COALESCE(balance, 0) + ?
         WHERE id = ?`,
        [interest, interest, interest, a.id]
      );
      results.count += 1;
      results.amount = money(results.amount + interest);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message)) results.skipped += 1;
      else results.errors.push(`${a.id}: ${e.message}`);
    }
  }
  return results;
}

/**
 * Term deposit accrual — Dr Interest expense / Cr TD liability (or interest payable 2200)
 */
async function accrueTermDeposits({ businessDate, actor }) {
  const results = { count: 0, amount: 0, journals: [], skipped: 0, errors: [] };
  let rows = [];
  try {
    const [r] = await pool.query(
      `SELECT id, td_ref, principal, outstanding_principal, rate_pct, interest_accrued, status
       FROM cbs_term_deposits
       WHERE status = 'active' AND COALESCE(rate_pct, 0) > 0
       LIMIT 5000`
    );
    rows = r;
  } catch (e) {
    results.errors.push(e.message);
    return results;
  }

  for (const td of rows) {
    const p = money(td.outstanding_principal ?? td.principal);
    const interest = simpleDailyInterest(p, td.rate_pct, 1);
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
        narrative: `TD accrual ${td.td_ref}`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '5000', debit: interest, credit: 0, narrative: 'TD interest expense' },
          { gl_code: '2200', debit: 0, credit: interest, narrative: 'TD interest payable' },
        ],
      });
      await pool.query(
        `UPDATE cbs_term_deposits
         SET interest_accrued = COALESCE(interest_accrued, 0) + ?
         WHERE id = ?`,
        [interest, td.id]
      );
      try {
        await pool.query(
          `INSERT INTO cbs_td_events (td_id, event_type, amount, journal_id, note, actor)
           VALUES (?, 'ACCRUE', ?, ?, ?, ?)`,
          [td.id, interest, journal.id || null, `EOD ${businessDate}`, actor]
        );
      } catch (_) {}
      results.count += 1;
      results.amount = money(results.amount + interest);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message)) results.skipped += 1;
      else results.errors.push(`${td.td_ref}: ${e.message}`);
    }
  }
  return results;
}

/**
 * Loan / financing accrual — Dr Loan asset (or interest receivable) / Cr Interest income
 * Uses rate_pct on contract when present; else skip.
 */
async function accrueFinancing({ businessDate, actor }) {
  const results = { count: 0, amount: 0, journals: [], skipped: 0, errors: [] };
  let rows = [];
  try {
    const [r] = await pool.query(
      `SELECT id, contract_no, principal, outstanding, rate_pct, status
       FROM cbs_financing_contracts
       WHERE status = 'active' AND COALESCE(outstanding, 0) > 0
       LIMIT 5000`
    );
    rows = r;
  } catch (e) {
    results.errors.push(e.message);
    return results;
  }

  for (const c of rows) {
    const rate = Number(c.rate_pct) || 0;
    if (rate <= 0) {
      results.skipped += 1;
      continue;
    }
    const os = money(c.outstanding);
    const interest = simpleDailyInterest(os, rate, 1);
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
        narrative: `Loan interest accrual ${c.contract_no}`,
        postedBy: actor,
        idempotencyKey: sourceRef,
        lines: [
          { gl_code: '1100', debit: interest, credit: 0, narrative: 'Interest receivable / loan' },
          { gl_code: '4000', debit: 0, credit: interest, narrative: 'Interest income' },
        ],
      });
      // Optionally increase outstanding by accrued interest (capitalizing)
      await pool.query(
        `UPDATE cbs_financing_contracts
         SET outstanding = COALESCE(outstanding, 0) + ?
         WHERE id = ?`,
        [interest, c.id]
      );
      results.count += 1;
      results.amount = money(results.amount + interest);
      results.journals.push(journal.id || journal.journal_ref);
    } catch (e) {
      if (/duplicate|idempoten/i.test(e.message)) results.skipped += 1;
      else results.errors.push(`${c.contract_no}: ${e.message}`);
    }
  }
  return results;
}

async function runAllAccruals({ businessDate, actor, skip = {} }) {
  const out = {
    business_date: businessDate,
    savings: skip.savings ? { skipped: true } : await accrueSavings({ businessDate, actor }),
    term_deposits: skip.td ? { skipped: true } : await accrueTermDeposits({ businessDate, actor }),
    financing: skip.financing ? { skipped: true } : await accrueFinancing({ businessDate, actor }),
  };
  out.total_amount = money(
    (out.savings.amount || 0) + (out.term_deposits.amount || 0) + (out.financing.amount || 0)
  );
  out.total_count =
    (out.savings.count || 0) + (out.term_deposits.count || 0) + (out.financing.count || 0);
  return out;
}

module.exports = {
  simpleDailyInterest,
  accrueSavings,
  accrueTermDeposits,
  accrueFinancing,
  runAllAccruals,
};
