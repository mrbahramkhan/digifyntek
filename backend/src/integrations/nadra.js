/**
 * NADRA identity verification (Pakistan) — mandatory for KYC
 * NADRA_MODE=simulator|live
 */
const crypto = require('crypto');

function mode() {
  return String(process.env.NADRA_MODE || 'simulator').toLowerCase() === 'live' ? 'live' : 'simulator';
}

function normalizeCnic(cnic) {
  return String(cnic || '').replace(/\D/g, '');
}

function validCnicFormat(cnic) {
  return normalizeCnic(cnic).length === 13;
}

async function verifySimulator({ cnic, fullName, dateOfBirth, fatherName }) {
  const n = normalizeCnic(cnic);
  if (!validCnicFormat(n)) {
    return { provider: 'NADRA', mode: 'simulator', status: 'invalid_cnic', verified: false, match_score: 0, message: 'CNIC must be 13 digits', reference: `SIM-INV-${Date.now()}`, citizen: null, raw: null };
  }
  if (n.endsWith('0000')) {
    return { provider: 'NADRA', mode: 'simulator', status: 'not_found', verified: false, match_score: 0, message: 'CNIC not found (simulated)', citizen: null, reference: `SIM-NF-${n.slice(-6)}`, raw: null };
  }
  if (n.endsWith('9999')) {
    return { provider: 'NADRA', mode: 'simulator', status: 'blocked', verified: false, match_score: 0, message: 'CNIC blocked/inactive (simulated)', citizen: { cnic: n, status: 'blocked' }, reference: `SIM-BLK-${n.slice(-6)}`, raw: null };
  }
  const citizen = {
    cnic: n,
    full_name: fullName || 'SIMULATED CITIZEN',
    father_or_husband: fatherName || 'SIMULATED FATHER',
    date_of_birth: dateOfBirth || '1990-01-01',
    gender: 'M',
    permanent_address: 'Simulated address, Pakistan',
    cnic_expiry: '2030-12-31',
    status: 'active',
  };
  let matchScore = 100;
  if (fullName && fullName.trim()) {
    const a = fullName.trim().toLowerCase();
    matchScore = a === citizen.full_name.toLowerCase() ? 95 : 70;
  }
  return {
    provider: 'NADRA', mode: 'simulator', status: 'verified', verified: true, match_score: matchScore,
    message: 'CNIC verified against NADRA simulator', citizen,
    reference: `SIM-OK-${crypto.randomBytes(4).toString('hex')}`, raw: null,
  };
}

async function verifyLive(payload) {
  const url = process.env.NADRA_API_URL;
  const key = process.env.NADRA_API_KEY;
  if (!url || !key) {
    const e = new Error('NADRA live mode requires NADRA_API_URL and NADRA_API_KEY');
    e.status = 503;
    e.code = 'NADRA_NOT_CONFIGURED';
    throw e;
  }
  const timeout = Number(process.env.NADRA_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'X-Client-Id': process.env.NADRA_CLIENT_ID || '',
      },
      body: JSON.stringify({
        cnic: normalizeCnic(payload.cnic),
        full_name: payload.fullName,
        date_of_birth: payload.dateOfBirth,
        father_name: payload.fatherName,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { provider: 'NADRA', mode: 'live', status: 'error', verified: false, match_score: 0, message: data.message || `NADRA HTTP ${res.status}`, citizen: null, reference: data.reference || null, raw: data };
    }
    return {
      provider: 'NADRA', mode: 'live',
      status: data.status || (data.verified ? 'verified' : 'failed'),
      verified: !!data.verified, match_score: Number(data.match_score || 0),
      message: data.message || 'NADRA response', citizen: data.citizen || data.data || null,
      reference: data.reference || data.txn_id || null, raw: data,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyIdentity(input) {
  const payload = {
    cnic: input.cnic,
    fullName: input.full_name || input.fullName,
    dateOfBirth: input.date_of_birth || input.dateOfBirth || input.dob,
    fatherName: input.father_name || input.fatherName || input.father_or_husband,
  };
  if (mode() === 'live') return verifyLive(payload);
  return verifySimulator(payload);
}

function configPublic() {
  return {
    provider: 'NADRA',
    mode: mode(),
    live_configured: !!(process.env.NADRA_API_URL && process.env.NADRA_API_KEY),
    mandatory_for_kyc: process.env.NADRA_MANDATORY !== '0',
    note: mode() === 'simulator'
      ? 'Simulator only — not a real NADRA call. Set NADRA_MODE=live + credentials for production.'
      : 'Live mode enabled',
  };
}

module.exports = { mode, normalizeCnic, validCnicFormat, verifyIdentity, verifySimulator, verifyLive, configPublic };
