/**
 * DigiFyntek — client product-line configuration
 *
 * Deploy ONE line to a client, or any combination:
 *
 *   PRODUCT_PACKS=conventional          # only conventional banking
 *   PRODUCT_PACKS=islamic               # only Islamic banking
 *   PRODUCT_PACKS=agri                  # only Agri App
 *   PRODUCT_PACKS=conventional,islamic  # dual
 *   PRODUCT_PACKS=conventional,islamic,agri  # full
 *
 * Optional file (overrides env if present):
 *   config/client.json  or  CLIENT_CONFIG_PATH
 *   { "client_id": "acme-bank", "client_name": "ACME", "packs": ["conventional"] }
 *
 * Aliases: core→conventional, kisaan→agri
 */

const fs = require('fs');
const path = require('path');

function flag(name, def = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function normalizeToken(p) {
  const x = String(p || '')
    .trim()
    .toLowerCase();
  if (!x) return null;
  if (['core', 'cbs', 'fintech', 'conventional', 'conv'].includes(x)) return 'conventional';
  if (['kisaan', 'cooperative', 'digitalkisaan', 'agri', 'agriculture'].includes(x)) return 'agri';
  if (['islamic', 'shariah', 'islamic_banking'].includes(x)) return 'islamic';
  if (['fmfb', 'mfb', 'microfinance'].includes(x)) return 'fmfb';
  return x;
}

function loadClientFile() {
  const candidates = [
    process.env.CLIENT_CONFIG_PATH,
    path.join(__dirname, 'client.json'),
    path.join(__dirname, '../../config/client.json'),
    path.join(process.cwd(), 'config/client.json'),
    path.join(process.cwd(), 'client.json'),
  ].filter(Boolean);

  for (const f of candidates) {
    try {
      if (fs.existsSync(f)) {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        return { path: f, ...j };
      }
    } catch (e) {
      console.warn('[products] client config read failed', f, e.message);
    }
  }
  return null;
}

function parsePacksFromEnv() {
  const raw = process.env.PRODUCT_PACKS;
  if (!raw || !String(raw).trim()) return null;
  return String(raw)
    .split(',')
    .map(normalizeToken)
    .filter(Boolean);
}

const client = loadClientFile();

let packList = null;
if (client && Array.isArray(client.packs) && client.packs.length) {
  packList = client.packs.map(normalizeToken).filter(Boolean);
} else {
  packList = parsePacksFromEnv();
}

// Default for multi-product lab installs only
if (!packList || !packList.length) {
  packList = ['conventional', 'islamic', 'agri'];
}

const packs = new Set(packList);

const products = {
  client_id: client?.client_id || process.env.CLIENT_ID || 'default',
  client_name: client?.client_name || process.env.CLIENT_NAME || 'DigiFyntek',
  config_source: client ? `file:${client.path}` : process.env.PRODUCT_PACKS ? 'env:PRODUCT_PACKS' : 'default',
  packs: [...packs],
  conventional: packs.has('conventional') || flag('ENABLE_CONVENTIONAL'),
  islamic: packs.has('islamic') || flag('ENABLE_ISLAMIC'),
  agri: packs.has('agri') || flag('ENABLE_AGRI') || flag('ENABLE_KISAAN'),
  fmfb: packs.has('fmfb') || flag('ENABLE_FMFB'),
};

// At least one banking line needs ledger/CIF surface:
// - conventional alone → conventional
// - islamic alone → still need core banking routes (accounts, ledger, eod) under islamic ops
// - agri alone → cooperative modules; still mount minimal auth + shared APIs
products.core = products.conventional || products.islamic;
products.kisaan = products.agri;

// Single-pack deploy helpers
products.single_pack = products.packs.length === 1 ? products.packs[0] : null;
products.is_single = !!products.single_pack;

products.label = {
  conventional: 'Conventional Banking',
  islamic: 'Islamic Banking',
  agri: 'Agri App',
  fmfb: 'FMFB / Microfinance',
  core: 'Conventional Banking',
  kisaan: 'Agri App',
};

products.public = function publicInfo() {
  return {
    client_id: products.client_id,
    client_name: products.client_name,
    packs: products.packs,
    single_pack: products.single_pack,
    labels: Object.fromEntries(products.packs.map((p) => [p, products.label[p] || p])),
    flags: {
      conventional: products.conventional,
      islamic: products.islamic,
      agri: products.agri,
      fmfb: products.fmfb,
    },
  };
};

module.exports = products;
