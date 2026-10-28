/**
 * Decimal money library tests
 * Run: node --test tests/money.lib.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/lib/money');

describe('money library — scale & parse', () => {
  it('normalizes to 2 dp', () => {
    assert.equal(M.money(10.006), 10.01);
    assert.equal(M.money(10.004), 10);
    assert.equal(M.money('1,234.567'), 1234.57);
  });

  it('handles non-finite as 0', () => {
    assert.equal(M.money(NaN), 0);
    assert.equal(M.money(Infinity), 0);
    assert.equal(M.money(null), 0);
  });

  it('preserves paisa without float drift on add', () => {
    // classic 0.1 + 0.2 problem
    assert.equal(M.add(0.1, 0.2), 0.3);
    assert.equal(M.add(0.1, 0.2, 0.3), 0.6);
  });

  it('sub and cmp', () => {
    assert.equal(M.sub(100.1, 0.1), 100);
    assert.equal(M.eq(10.5, '10.50'), true);
    assert.equal(M.gt(10.01, 10), true);
    assert.equal(M.lte(10, 10.0), true);
  });
});

describe('money library — interest', () => {
  it('simple interest 100000 @ 10% for 365 days = 10000', () => {
    assert.equal(M.simpleInterest(100000, 10, 365), 10000);
  });

  it('mulPercent', () => {
    assert.equal(M.mulPercent(1000, 15), 150);
  });
});

describe('money library — journal balance', () => {
  it('sum debits equals credits in minor units', () => {
    const lines = [
      { debit: 100.1, credit: 0 },
      { debit: 0, credit: 50.05 },
      { debit: 0, credit: 50.05 },
    ];
    const dr = lines.reduce((s, l) => M.add(s, l.debit), 0);
    const cr = lines.reduce((s, l) => M.add(s, l.credit), 0);
    assert.equal(M.eq(dr, cr), true);
  });
});
