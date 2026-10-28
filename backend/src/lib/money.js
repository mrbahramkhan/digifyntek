/**
 * DigiFyntek money — fixed-scale decimal (default 2 for PKR).
 * Internal representation: integer minor units (paisa) to avoid IEEE float drift.
 */
const DEFAULT_SCALE = 2;

function scaleFactor(scale = DEFAULT_SCALE) {
  return 10 ** scale;
}

function toMinor(value, scale = DEFAULT_SCALE) {
  if (value == null || value === '') return 0;
  if (typeof value === 'object' && value !== null && Number.isFinite(value.minor)) {
    return Math.trunc(value.minor);
  }
  const s = String(value).trim().replace(/,/g, '');
  if (!s || s === '-' || s === '.') return 0;
  const neg = s.startsWith('-');
  const raw = neg ? s.slice(1) : s;
  if (!/^\d*\.?\d*$/.test(raw)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * scaleFactor(scale));
  }
  const [wholePart, fracPart = ''] = raw.split('.');
  const whole = wholePart === '' ? 0 : parseInt(wholePart, 10);
  const fracPadded = (fracPart + '0'.repeat(scale)).slice(0, scale);
  const frac = parseInt(fracPadded || '0', 10);
  let extra = 0;
  if (fracPart.length > scale) {
    const next = parseInt(fracPart[scale] || '0', 10);
    if (next >= 5) extra = 1;
  }
  const minor = whole * scaleFactor(scale) + frac + extra;
  return neg ? -minor : minor;
}

function fromMinor(minor, scale = DEFAULT_SCALE) {
  const m = Math.trunc(Number(minor) || 0);
  const neg = m < 0;
  const abs = Math.abs(m);
  const f = scaleFactor(scale);
  const whole = Math.floor(abs / f);
  const frac = String(abs % f).padStart(scale, '0');
  const str = scale > 0 ? `${whole}.${frac}` : String(whole);
  return neg ? -Number(str) : Number(str);
}

function money(value, scale = DEFAULT_SCALE) {
  return fromMinor(toMinor(value, scale), scale);
}

function add(...values) {
  let sum = 0;
  for (const v of values) sum += toMinor(v);
  return fromMinor(sum);
}

function sub(a, b) {
  return fromMinor(toMinor(a) - toMinor(b));
}

function mul(a, b) {
  const am = toMinor(a);
  const bm = toMinor(b);
  const prod = Math.round((am * bm) / scaleFactor());
  return fromMinor(prod);
}

function mulPercent(amount, ratePercent) {
  const am = toMinor(amount);
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate)) return 0;
  return fromMinor(Math.round((am * rate) / 100));
}

function simpleInterest(principal, ratePercent, days, daysInYear = 365) {
  const p = toMinor(principal);
  const r = Number(ratePercent) || 0;
  const d = Number(days) || 0;
  const y = Number(daysInYear) || 365;
  if (p === 0 || r === 0 || d === 0) return 0;
  return fromMinor(Math.round((p * r * d) / (100 * y)));
}

function cmp(a, b) {
  const d = toMinor(a) - toMinor(b);
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

function eq(a, b) {
  return cmp(a, b) === 0;
}
function gt(a, b) {
  return cmp(a, b) > 0;
}
function gte(a, b) {
  return cmp(a, b) >= 0;
}
function lt(a, b) {
  return cmp(a, b) < 0;
}
function lte(a, b) {
  return cmp(a, b) <= 0;
}
function isPositive(a) {
  return toMinor(a) > 0;
}
function isZero(a) {
  return toMinor(a) === 0;
}
function abs(a) {
  return fromMinor(Math.abs(toMinor(a)));
}
function min(a, b) {
  return lt(a, b) ? money(a) : money(b);
}
function max(a, b) {
  return gt(a, b) ? money(a) : money(b);
}
function format(value, scale = DEFAULT_SCALE, locale = 'en-PK') {
  const n = money(value, scale);
  return n.toLocaleString(locale, {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
}

module.exports = {
  DEFAULT_SCALE,
  toMinor,
  fromMinor,
  money,
  add,
  sub,
  mul,
  mulPercent,
  simpleInterest,
  cmp,
  eq,
  gt,
  gte,
  lt,
  lte,
  isPositive,
  isZero,
  abs,
  min,
  max,
  format,
};
