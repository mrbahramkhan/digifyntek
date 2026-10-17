/**
 * Ledger integrity integration tests (requires MySQL digifyntek + schema 09)
 *
 *   DB_HOST=127.0.0.1 DB_USER=digi DB_PASSWORD=... DB_NAME=digifyntek \
 *     node --test tests/ledger.integrity.test.js
 *
 * Skips cleanly when database is unreachable.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let pool;
let ledger;
let dbOk = false;
const stamp = Date.now().toString(36);

async function canConnect() {
  try {
    pool = require('../src/config/db');
    ledger = require('../src/ledger/service');
    const [r] = await pool.query('SELECT 1 AS ok');
    await pool.query('SELECT 1 FROM cbs_coa LIMIT 1');
    await pool.query('SELECT 1 FROM cbs_customers LIMIT 1');
    return r[0].ok === 1;
  } catch (e) {
    return false;
  }
}

before(async () => {
  dbOk = await canConnect();
  if (!dbOk) {
    console.log('SKIP ledger integrity: database/schema not available');
  }
});

after(async () => {
  if (pool && pool.end) {
    try {
      await pool.end();
    } catch (_) {}
  }
});

describe('Ledger integrity', () => {
  it('rejects unbalanced journal', async (t) => {
    if (!dbOk) { t.skip('database not available'); return; }
    await assert.rejects(
      () =>
        ledger.postJournal({
          businessDate: '2026-01-15',
          sourceModule: 'TEST',
          narrative: 'unbalanced',
          lines: [
            { gl_code: '1000', debit: 100, credit: 0 },
            { gl_code: '2000', debit: 0, credit: 50 },
          ],
        }),
      /Unbalanced/
    );
  });

  it('posts balanced journal and trial balance still balances', async (t) => {
    if (!dbOk) { t.skip('database not available'); return; }
    const j = await ledger.postJournal({
      businessDate: '2026-01-15',
      sourceModule: 'TEST',
      narrative: `integrity-${stamp}`,
      lines: [
        { gl_code: '1000', debit: 250.5, credit: 0 },
        { gl_code: '2000', debit: 0, credit: 250.5 },
      ],
      idempotencyKey: `TEST-BAL-${stamp}`,
    });
    assert.equal(j.status, 'POSTED');
    assert.equal(j.total_debit, 250.5);
    assert.equal(j.total_credit, 250.5);

    const tb = await ledger.trialBalance('2099-12-31');
    assert.equal(tb.balanced, true);
  });

  it('idempotent journal does not double-post', async (t) => {
    if (!dbOk) { t.skip('database not available'); return; }
    const key = `TEST-IDEM-${stamp}`;
    const a = await ledger.postJournal({
      businessDate: '2026-01-16',
      sourceModule: 'TEST',
      lines: [
        { gl_code: '1000', debit: 10, credit: 0 },
        { gl_code: '2000', debit: 0, credit: 10 },
      ],
      idempotencyKey: key,
    });
    const b = await ledger.postJournal({
      businessDate: '2026-01-16',
      sourceModule: 'TEST',
      lines: [
        { gl_code: '1000', debit: 10, credit: 0 },
        { gl_code: '2000', debit: 0, credit: 10 },
      ],
      idempotencyKey: key,
    });
    assert.equal(a.journal_ref, b.journal_ref);
    assert.equal(b.idempotent, true);
  });

  it('reversal creates compensating journal and marks original REVERSED', async (t) => {
    if (!dbOk) { t.skip('database not available'); return; }
    const j = await ledger.postJournal({
      businessDate: '2026-01-17',
      sourceModule: 'TEST',
      lines: [
        { gl_code: '1000', debit: 77, credit: 0 },
        { gl_code: '2000', debit: 0, credit: 77 },
      ],
      idempotencyKey: `TEST-REV-${stamp}`,
    });
    const rev = await ledger.reverseJournal(j.id, { postedBy: 'test' });
    assert.ok(rev.journal_ref);
    const [[orig]] = await pool.query(`SELECT status FROM cbs_journal_headers WHERE id = ?`, [j.id]);
    assert.equal(orig.status, 'REVERSED');
  });

  it('deposit then withdraw and insufficient funds', async (t) => {
    if (!dbOk) { t.skip('database not available'); return; }
    // ensure customer + account
    const cnic = `9${stamp}`.slice(0, 15);
    const [cIns] = await pool.query(
      `INSERT INTO cbs_customers (customer_no, full_name, cnic, status, kyc_status)
       VALUES (?, ?, ?, 'active', 'pending')`,
      [`T${stamp}`, `Test Customer ${stamp}`, cnic]
    );
    const customerId = cIns.insertId;
    const [aIns] = await pool.query(
      `INSERT INTO cbs_accounts (account_no, customer_id, product_code, branch_code, status, ledger_balance, available_balance, opened_at)
       VALUES (?, ?, 'SAV-PKR', '001', 'active', 0, 0, CURDATE())`,
      [`A${stamp}`, customerId]
    );
    const accountId = aIns.insertId;

    await ledger.cashDeposit({
      accountId,
      amount: 1000,
      businessDate: '2026-01-18',
      createdBy: 'test',
      idempotencyKey: `DEP-${stamp}`,
    });
    const [[a1]] = await pool.query(`SELECT ledger_balance FROM cbs_accounts WHERE id = ?`, [accountId]);
    assert.equal(Number(a1.ledger_balance), 1000);

    await ledger.cashWithdrawal({
      accountId,
      amount: 400,
      businessDate: '2026-01-18',
      createdBy: 'test',
      idempotencyKey: `WDR-${stamp}`,
    });
    const [[a2]] = await pool.query(`SELECT ledger_balance FROM cbs_accounts WHERE id = ?`, [accountId]);
    assert.equal(Number(a2.ledger_balance), 600);

    await assert.rejects(
      () =>
        ledger.cashWithdrawal({
          accountId,
          amount: 99999,
          businessDate: '2026-01-18',
          createdBy: 'test',
          idempotencyKey: `WDR-FAIL-${stamp}`,
        }),
      /Insufficient/
    );
  });

  it('internal transfer is balanced and moves balances', async (t) => {
    if (!dbOk) { t.skip('database not available'); return; }
    const tag = stamp + 't';
    const [cIns] = await pool.query(
      `INSERT INTO cbs_customers (customer_no, full_name, status) VALUES (?, ?, 'active')`,
      [`C${tag}`, `Xfer ${tag}`]
    );
    const cid = cIns.insertId;
    const [a1] = await pool.query(
      `INSERT INTO cbs_accounts (account_no, customer_id, product_code, branch_code, status, ledger_balance, available_balance, opened_at)
       VALUES (?, ?, 'SAV-PKR', '001', 'active', 0, 0, CURDATE())`,
      [`F${tag}`, cid]
    );
    const [a2] = await pool.query(
      `INSERT INTO cbs_accounts (account_no, customer_id, product_code, branch_code, status, ledger_balance, available_balance, opened_at)
       VALUES (?, ?, 'SAV-PKR', '001', 'active', 0, 0, CURDATE())`,
      [`T${tag}`, cid]
    );
    await ledger.cashDeposit({
      accountId: a1.insertId,
      amount: 5000,
      businessDate: '2026-01-19',
      idempotencyKey: `DEP-X-${tag}`,
    });
    const xfer = await ledger.internalTransfer({
      fromAccountId: a1.insertId,
      toAccountId: a2.insertId,
      amount: 1500,
      businessDate: '2026-01-19',
      idempotencyKey: `XFER-${tag}`,
    });
    assert.equal(xfer.status, 'POSTED');
    const [[from]] = await pool.query(`SELECT ledger_balance FROM cbs_accounts WHERE id = ?`, [a1.insertId]);
    const [[to]] = await pool.query(`SELECT ledger_balance FROM cbs_accounts WHERE id = ?`, [a2.insertId]);
    assert.equal(Number(from.ledger_balance), 3500);
    assert.equal(Number(to.ledger_balance), 1500);

    // idempotent transfer
    const x2 = await ledger.internalTransfer({
      fromAccountId: a1.insertId,
      toAccountId: a2.insertId,
      amount: 1500,
      businessDate: '2026-01-19',
      idempotencyKey: `XFER-${tag}`,
    });
    assert.equal(x2.idempotent, true);
  });
});
