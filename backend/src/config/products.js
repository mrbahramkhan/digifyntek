/**
 * DigiFyntek product packs — independent major modules.
 *
 * Env (comma-separated PRODUCT_PACKS or individual ENABLE_* flags):
 *   PRODUCT_PACKS=core,kisaan,islamic,fmfb
 *   Defaults: all on for full platform; set PRODUCT_PACKS=core for CBS-only.
 *
 *   core     — Fintech CBS: CIF, CASA, ledger, financing, TD, teller, EOD, RBAC…
 *   kisaan   — Kisaan App: members, shares, savings, VAC/branch,
 *              membership cards, cooperative compliance, registration checklist
 *   islamic  — Islamic finance modes: murabaha + other modes UI/API
 *   fmfb     — Microfinance bank: MFB prudential, asset quality, capital, collateral depth
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
  // Default: full platform (all packs)
  return new Set(['core', 'kisaan', 'islamic', 'fmfb']);
}

const packs = parsePacks();

const products = {
  packs: [...packs],
  core: packs.has('core') || packs.has('cbs') || packs.has('fintech'),
  kisaan: packs.has('kisaan') || packs.has('cooperative') || packs.has('digitalkisaan') || flag('ENABLE_KISAAN'),
  islamic: packs.has('islamic') || packs.has('shariah') || flag('ENABLE_ISLAMIC'),
  fmfb: packs.has('fmfb') || packs.has('mfb') || packs.has('microfinance') || flag('ENABLE_FMFB'),
};

// Core is always required for ledger integrity
if (!products.core) {
  products.core = true;
  if (!products.packs.includes('core')) products.packs.unshift('core');
}

products.label = {
  core: 'Fintech CBS',
  kisaan: 'Kisaan App',
  islamic: 'Islamic Finance',
  fmfb: 'FMFB / Microfinance',
};

module.exports = products;
