/**
 * Pure unit tests — no database / mysql required
 * Mirrors ledger money helpers for offline CI
 * Run: node --test tests/money.unit.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function tdInterest(principal, ratePct, days) {
  const p = money(principal);
  const r = Number(ratePct) || 0;
  const n = Number(days) || 0;
  return money((p * r * n) / (100 * 365));
}

function addDaysIso(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

describe('money()', () => {
  it('rounds to 2 decimal places', () => {
    assert.equal(money(10.006), 10.01);
    assert.equal(money(10.004), 10);
  });
  it('treats non-finite as 0', () => {
    assert.equal(money(NaN), 0);
    assert.equal(money(Infinity), 0);
  });
  it('preserves whole rupees', () => {
    assert.equal(money(1000), 1000);
  });
});

describe('tdInterest()', () => {
  it('computes simple interest for 365 days at 10%', () => {
    assert.equal(tdInterest(100000, 10, 365), 10000);
  });
  it('returns 0 for zero principal or days', () => {
    assert.equal(tdInterest(0, 10, 365), 0);
    assert.equal(tdInterest(1000, 10, 0), 0);
  });
});

describe('addDaysIso()', () => {
  it('adds calendar days', () => {
    assert.equal(addDaysIso('2026-01-01', 10), '2026-01-11');
  });
});

describe('journal balance invariant (logic)', () => {
  function totals(lines) {
    let dr = 0;
    let cr = 0;
    for (const l of lines) {
      dr += money(l.debit);
      cr += money(l.credit);
    }
    return { dr: money(dr), cr: money(cr), balanced: money(dr) === money(cr) };
  }
  it('accepts balanced two-line journal', () => {
    assert.equal(totals([{ debit: 500, credit: 0 }, { debit: 0, credit: 500 }]).balanced, true);
  });
  it('rejects unbalanced journal', () => {
    assert.equal(totals([{ debit: 500, credit: 0 }, { debit: 0, credit: 400 }]).balanced, false);
  });
});
