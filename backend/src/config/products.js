/**
 * DigiFyntek — three primary product lines (+ optional FMFB)
 *
 * PRODUCT_PACKS=conventional,islamic,agri
 * Aliases: core→conventional, kisaan→agri
 *
 *   conventional — Conventional banking (CIF, CASA, loans, TD, teller, EOD…)
 *   islamic      — Islamic banking (Shariah products, murabaha, profit accrual)
 *   agri         — Agri App (cooperative members, shares, agri compliance)
 *   fmfb         — optional microfinance prudential pack
 */

function flag(name, def = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function parsePacks() {
  const raw = process.env.PRODUCT_PACKS;
  if (raw && String(raw).trim()) {
    return new Set(
      String(raw)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
  }
  return new Set(['conventional', 'islamic', 'agri', 'fmfb']);
}

const raw = parsePacks();

// Normalize aliases
const packs = new Set();
for (const p of raw) {
  if (p === 'core' || p === 'cbs' || p === 'fintech' || p === 'conventional') packs.add('conventional');
  else if (p === 'kisaan' || p === 'cooperative' || p === 'digitalkisaan' || p === 'agri') packs.add('agri');
  else if (p === 'islamic' || p === 'shariah') packs.add('islamic');
  else if (p === 'fmfb' || p === 'mfb' || p === 'microfinance') packs.add('fmfb');
  else packs.add(p);
}

const products = {
  packs: [...packs],
  // primary three
  conventional:
    packs.has('conventional') || flag('ENABLE_CONVENTIONAL') || flag('ENABLE_CORE'),
  islamic: packs.has('islamic') || flag('ENABLE_ISLAMIC'),
  agri: packs.has('agri') || flag('ENABLE_AGRI') || flag('ENABLE_KISAAN'),
  fmfb: packs.has('fmfb') || flag('ENABLE_FMFB'),
};

// Shared ledger / CIF always on with conventional; if only islamic still need ledger
if (!products.conventional && !products.islamic) {
  products.conventional = true;
  if (!products.packs.includes('conventional')) products.packs.unshift('conventional');
}

// Back-compat flags used by server.js
products.core = products.conventional;
products.kisaan = products.agri;

products.label = {
  conventional: 'Conventional Banking',
  islamic: 'Islamic Banking',
  agri: 'Agri App',
  fmfb: 'FMFB / Microfinance',
  // aliases
  core: 'Conventional Banking',
  kisaan: 'Agri App',
};

module.exports = products;
