/**
 * RBAC matrix — DB-backed with in-memory fallback for boot without seed
 */
const pool = require('../config/db');

const FALLBACK = {
  superadmin: ['*'],
  admin: ['*'],
  ops_manager: [
    'cif.read', 'kyc.read', 'accounts.read', 'casa.post', 'transfer.post', 'ledger.read',
    'loan.read', 'td.read', 'approval.read', 'approval.decide', 'payments.read',
    'teller.ops', 'clearing.ops', 'recon.ops', 'instruments.ops', 'eod.run', 'reports.read',
    'agri.members',
  ],
  branch_manager: [
    'cif.read', 'cif.write', 'kyc.read', 'accounts.read', 'accounts.write', 'casa.post',
    'transfer.post', 'ledger.read', 'loan.read', 'td.read', 'td.write',
    'approval.read', 'approval.decide', 'teller.ops', 'instruments.ops', 'reports.read',
  ],
  teller: [
    'cif.read', 'accounts.read', 'casa.post', 'transfer.post', 'teller.ops', 'instruments.ops', 'payments.read',
  ],
  credit_officer: [
    'cif.read', 'cif.write', 'kyc.read', 'kyc.write', 'nadra.verify', 'accounts.read',
    'loan.read', 'loan.disburse', 'loan.repay', 'td.read', 'td.write',
    'approval.read', 'reports.read', 'islamic.read', 'islamic.write',
  ],
  compliance: [
    'cif.read', 'kyc.read', 'kyc.write', 'kyc.decide', 'nadra.verify',
    'accounts.read', 'loan.read', 'reports.read',
  ],
  accountant: [
    'cif.read', 'accounts.read', 'ledger.read', 'ledger.post', 'ledger.reverse',
    'loan.read', 'td.read', 'clearing.ops', 'recon.ops', 'eod.run', 'reports.read', 'approval.read',
  ],
  islamic_officer: [
    'cif.read', 'kyc.read', 'nadra.verify', 'accounts.read',
    'loan.read', 'loan.disburse', 'loan.repay', 'td.read', 'td.write',
    'islamic.read', 'islamic.write', 'reports.read',
  ],
  viewer: [
    'cif.read', 'kyc.read', 'accounts.read', 'ledger.read', 'loan.read', 'td.read',
    'payments.read', 'approval.read', 'reports.read', 'islamic.read', 'agri.members',
  ],
  user: ['cif.read', 'accounts.read', 'ledger.read'],
};

let cache = null;
let cacheAt = 0;
const TTL_MS = 60_000;

async function loadMatrix() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const [rows] = await pool.query(`SELECT role_code, perm_code FROM cbs_role_permissions`);
    const map = {};
    for (const r of rows) {
      if (!map[r.role_code]) map[r.role_code] = [];
      map[r.role_code].push(r.perm_code);
    }
    map.superadmin = ['*'];
    if (!map.admin) map.admin = ['*'];
    cache = Object.keys(map).length ? map : { ...FALLBACK };
    cacheAt = Date.now();
    return cache;
  } catch (_) {
    cache = { ...FALLBACK };
    cacheAt = Date.now();
    return cache;
  }
}

function invalidate() {
  cache = null;
  cacheAt = 0;
}

async function permissionsForRole(role) {
  const matrix = await loadMatrix();
  const r = String(role || 'viewer').toLowerCase();
  if (r === 'superadmin' || r === 'admin') return ['*'];
  return matrix[r] || matrix.viewer || FALLBACK.viewer;
}

async function hasPermission(role, perm) {
  const perms = await permissionsForRole(role);
  if (perms.includes('*')) return true;
  return perms.includes(perm);
}

async function listRoles() {
  try {
    const [rows] = await pool.query(`SELECT * FROM cbs_roles ORDER BY role_code`);
    if (rows.length) return rows;
  } catch (_) {}
  return Object.keys(FALLBACK).map((role_code) => ({
    role_code,
    role_name: role_code,
    description: 'fallback',
  }));
}

async function listPermissions() {
  try {
    const [rows] = await pool.query(`SELECT * FROM cbs_permissions ORDER BY module, perm_code`);
    if (rows.length) return rows;
  } catch (_) {}
  const out = [];
  const seen = new Set();
  for (const perms of Object.values(FALLBACK)) {
    for (const p of perms) {
      if (p === '*' || seen.has(p)) continue;
      seen.add(p);
      out.push({ perm_code: p, module: p.split('.')[0], description: p });
    }
  }
  return out;
}

async function getMatrixView() {
  const roles = await listRoles();
  const perms = await listPermissions();
  const matrix = await loadMatrix();
  return { roles, permissions: perms, matrix };
}

module.exports = {
  loadMatrix,
  invalidate,
  permissionsForRole,
  hasPermission,
  listRoles,
  listPermissions,
  getMatrixView,
  FALLBACK,
};
