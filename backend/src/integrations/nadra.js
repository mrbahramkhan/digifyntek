/**
 * DigiFyntek — NADRA identity verification integration
 *
 * Modes:
 *   NADRA_MODE=simulator  (default, local UAT)
 *   NADRA_MODE=live       (calls configured gateway)
 *
 * Live is usually NOT direct NADRA internet API from app servers.
 * Banks use a licensed channel / middleware (Verisys / Bio-Verisys / aggregator).
 * Point NADRA_API_URL at that gateway; map response in mapLiveResponse().
 *
 * Env (see .env.example):
 *   NADRA_MODE, NADRA_API_URL, NADRA_API_KEY, NADRA_CLIENT_ID, NADRA_CLIENT_SECRET
 *   NADRA_BIOMETRIC=1|0
 *   NADRA_TIMEOUT_MS
 *   NADRA_VERIFY_PATH          default /verisys/verify
 *   NADRA_BIO_PATH             default /bio-verisys/verify
 *   NADRA_AUTH_HEADER          default Bearer
 *   NADRA_MANDATORY
 */

const crypto = require('crypto');
const logger = require('../services/logger');

function mode() {
  return String(process.env.NADRA_MODE || 'simulator').toLowerCase() === 'live' ? 'live' : 'simulator';
}

function normalizeCnic(cnic) {
  return String(cnic || '').replace(/\D/g, '');
}

function validCnicFormat(cnic) {
  return normalizeCnic(cnic).length === 13;
}

function ref(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function biometricRequired() {
  return process.env.NADRA_BIOMETRIC !== '0';
}

/** Normalized citizen object used by CIF auto-fill */
function emptyCitizen(cnic) {
  return {
    cnic: normalizeCnic(cnic),
    full_name: null,
    father_or_husband: null,
    mother_name: null,
    date_of_birth: null,
    gender: null,
    permanent_address: null,
    present_address: null,
    city: null,
    district: null,
    province: null,
    cnic_issue: null,
    cnic_expiry: null,
    status: null,
    photo_base64: null,
  };
}

function mapLiveResponse(data, httpStatus) {
  // Adapt common gateway shapes — adjust when vendor contract is known
  const citizenSrc = data.citizen || data.data || data.result || data.Citizen || {};
  const verified =
    data.verified === true ||
    data.success === true ||
    String(data.status || '').toLowerCase() === 'verified' ||
    String(data.Status || '').toLowerCase() === 'verified';

  const citizen = {
    cnic: normalizeCnic(citizenSrc.cnic || citizenSrc.CNIC || citizenSrc.citizen_number || data.cnic),
    full_name: citizenSrc.full_name || citizenSrc.name || citizenSrc.Name || citizenSrc.citizen_name || null,
    father_or_husband: citizenSrc.father_or_husband || citizenSrc.father_name || citizenSrc.FatherName || null,
    mother_name: citizenSrc.mother_name || citizenSrc.MotherName || null,
    date_of_birth: citizenSrc.date_of_birth || citizenSrc.dob || citizenSrc.DateOfBirth || null,
    gender: citizenSrc.gender || citizenSrc.Gender || null,
    permanent_address: citizenSrc.permanent_address || citizenSrc.address || citizenSrc.PermanentAddress || null,
    present_address: citizenSrc.present_address || citizenSrc.PresentAddress || null,
    city: citizenSrc.city || citizenSrc.City || null,
    district: citizenSrc.district || citizenSrc.District || null,
    province: citizenSrc.province || citizenSrc.Province || null,
    cnic_issue: citizenSrc.cnic_issue || citizenSrc.issue_date || citizenSrc.DateOfIssuance || null,
    cnic_expiry: citizenSrc.cnic_expiry || citizenSrc.expiry_date || citizenSrc.DateOfExpiry || null,
    status: citizenSrc.status || citizenSrc.card_status || null,
    photo_base64: citizenSrc.photo_base64 || citizenSrc.photo || null,
  };

  return {
    provider: 'NADRA',
    mode: 'live',
    status: verified ? 'verified' : data.status || data.Status || (httpStatus >= 400 ? 'error' : 'failed'),
    verified: !!verified,
    match_score: Number(data.match_score || data.MatchScore || data.score || (verified ? 100 : 0)),
    message: data.message || data.Message || data.error || (verified ? 'Verified' : 'Not verified'),
    reference: data.reference || data.txn_id || data.TransactionId || data.session_id || null,
    biometric_matched: data.biometric_matched != null ? !!data.biometric_matched : undefined,
    citizen: verified ? citizen : null,
    raw: data,
  };
}

async function postGateway(pathEnv, defaultPath, body) {
  const base = String(process.env.NADRA_API_URL || '').replace(/\/$/, '');
  const key = process.env.NADRA_API_KEY || process.env.NADRA_CLIENT_SECRET || '';
  if (!base || !key) {
    const err = new Error('NADRA live credentials missing (NADRA_API_URL + NADRA_API_KEY)');
    err.code = 'NADRA_CONFIG';
    throw err;
  }
  const path = process.env[pathEnv] || defaultPath;
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const timeout = Number(process.env.NADRA_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Client-Id': process.env.NADRA_CLIENT_ID || '',
    'X-Request-Id': body.request_id || ref('REQ'),
  };
  const authStyle = String(process.env.NADRA_AUTH_HEADER || 'Bearer').toLowerCase();
  if (authStyle === 'bearer') headers.Authorization = `Bearer ${key}`;
  else if (authStyle === 'apikey') headers['X-API-Key'] = key;
  else headers.Authorization = key;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({ message: `Non-JSON response HTTP ${res.status}` }));
    if (!res.ok) {
      return {
        provider: 'NADRA',
        mode: 'live',
        status: 'error',
        verified: false,
        match_score: 0,
        message: data.message || data.Message || `NADRA HTTP ${res.status}`,
        citizen: null,
        reference: data.reference || data.txn_id || null,
        raw: data,
        http_status: res.status,
      };
    }
    return mapLiveResponse(data, res.status);
  } catch (e) {
    logger.warn?.('NADRA gateway error', { err: e.message }) || console.warn('NADRA', e.message);
    return {
      provider: 'NADRA',
      mode: 'live',
      status: e.name === 'AbortError' ? 'timeout' : 'error',
      verified: false,
      match_score: 0,
      message: e.message || 'NADRA call failed',
      citizen: null,
      reference: ref('ERR'),
      raw: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verisys-style demographic / card verification (no finger template).
 * Live body is a skeleton — map fields to your vendor WSDL/REST contract.
 */
async function verifyVerisys(payload) {
  const cnic = normalizeCnic(payload.cnic);
  return postGateway('NADRA_VERIFY_PATH', '/verisys/verify', {
    request_id: ref('VER'),
    service: 'verisys',
    cnic,
    full_name: payload.fullName || undefined,
    date_of_birth: payload.dateOfBirth || undefined,
    father_name: payload.fatherName || undefined,
    // vendor-specific placeholders:
    franchise_id: process.env.NADRA_FRANCHISE_ID || undefined,
    branch_code: payload.branchCode || process.env.NADRA_BRANCH_CODE || undefined,
  });
}

/**
 * Bio-Verisys — fingerprint / face template + CNIC.
 * Template encoding depends on device SDK (ISO/ANSI/vendor base64).
 */
async function verifyBioVerisys(payload) {
  const cnic = normalizeCnic(payload.cnic);
  if (!payload.biometricTemplate && !payload.biometricOk) {
    return {
      provider: 'NADRA',
      mode: mode(),
      status: 'biometric_required',
      verified: false,
      match_score: 0,
      message: 'biometric_template required for Bio-Verisys',
      biometric_required: true,
      citizen: null,
      reference: ref('BIO-REQ'),
      raw: null,
    };
  }
  return postGateway('NADRA_BIO_PATH', '/bio-verisys/verify', {
    request_id: ref('BIO'),
    service: 'bio_verisys',
    cnic,
    // template: base64 from device middleware — do not log raw template in production
    biometric_template: payload.biometricTemplate || (payload.biometricOk ? 'DEVICE_OK_PLACEHOLDER' : null),
    biometric_type: payload.biometricType || process.env.NADRA_BIO_TYPE || 'FINGERPRINT',
    finger_index: payload.fingerIndex || undefined,
    full_name: payload.fullName || undefined,
    franchise_id: process.env.NADRA_FRANCHISE_ID || undefined,
    branch_code: payload.branchCode || process.env.NADRA_BRANCH_CODE || undefined,
  });
}

async function verifySimulator(payload) {
  const n = normalizeCnic(payload.cnic);
  if (!validCnicFormat(n)) {
    return {
      provider: 'NADRA',
      mode: 'simulator',
      status: 'invalid_cnic',
      verified: false,
      match_score: 0,
      message: 'CNIC must be 13 digits',
      reference: ref('SIM-INV'),
      citizen: null,
      raw: null,
    };
  }

  if (biometricRequired() && !payload.biometricOk && !payload.biometricTemplate) {
    return {
      provider: 'NADRA',
      mode: 'simulator',
      status: 'biometric_required',
      verified: false,
      match_score: 0,
      message: 'Biometric capture required before NADRA data fetch',
      biometric_required: true,
      reference: ref('SIM-BIO'),
      citizen: null,
      raw: null,
    };
  }

  if (n.endsWith('0000')) {
    return {
      provider: 'NADRA',
      mode: 'simulator',
      status: 'not_found',
      verified: false,
      match_score: 0,
      message: 'CNIC not found (simulated)',
      citizen: null,
      reference: ref('SIM-NF'),
      raw: null,
    };
  }
  if (n.endsWith('9999')) {
    return {
      provider: 'NADRA',
      mode: 'simulator',
      status: 'blocked',
      verified: false,
      match_score: 0,
      message: 'CNIC blocked/inactive (simulated)',
      citizen: { ...emptyCitizen(n), status: 'blocked' },
      reference: ref('SIM-BLK'),
      raw: null,
    };
  }

  const citizen = {
    ...emptyCitizen(n),
    full_name: payload.fullName || 'SIMULATED CITIZEN ' + n.slice(-4),
    father_or_husband: payload.fatherName || 'SIMULATED FATHER',
    mother_name: 'SIMULATED MOTHER',
    date_of_birth: payload.dateOfBirth || '1990-01-01',
    gender: Number(n.slice(-2)) % 2 === 0 ? 'F' : 'M',
    permanent_address: 'House ' + n.slice(-3) + ', Block A, Simulated Town, Pakistan',
    present_address: 'Same as permanent',
    city: 'Lahore',
    district: 'Lahore',
    province: 'Punjab',
    cnic_issue: '2015-06-15',
    cnic_expiry: '2030-12-31',
    status: 'active',
  };

  let matchScore = 100;
  if (payload.fullName && payload.fullName.trim()) {
    const a = payload.fullName.trim().toLowerCase();
    matchScore = a === String(citizen.full_name).toLowerCase() ? 100 : 70;
  }

  return {
    provider: 'NADRA',
    mode: 'simulator',
    status: 'verified',
    verified: true,
    match_score: matchScore,
    message: 'Simulated NADRA verification OK',
    biometric_matched: true,
    biometric_required: false,
    reference: ref('SIM-OK'),
    citizen,
    raw: { simulated: true },
  };
}

/**
 * Primary entry used by routes.
 * Prefer Bio-Verisys when biometric present; else Verisys if NADRA_ALLOW_VERISYS=1; else bio required.
 */
async function verifyIdentity(input) {
  const payload = {
    cnic: input.cnic,
    fullName: input.full_name || input.fullName,
    dateOfBirth: input.date_of_birth || input.dateOfBirth || input.dob,
    fatherName: input.father_name || input.fatherName || input.father_or_husband,
    biometricOk: !!(input.biometric_ok || input.biometricOk),
    biometricTemplate: input.biometric_template || input.biometricTemplate || null,
    biometricType: input.biometric_type || input.biometricType,
    fingerIndex: input.finger_index || input.fingerIndex,
    branchCode: input.branch_code || input.branchCode,
    forceVerisys: !!(input.verisys_only || input.force_verisys),
  };

  if (!validCnicFormat(payload.cnic)) {
    return {
      provider: 'NADRA',
      mode: mode(),
      status: 'invalid_cnic',
      verified: false,
      match_score: 0,
      message: 'CNIC must be 13 digits',
      citizen: null,
      reference: ref('INV'),
      raw: null,
    };
  }

  if (mode() === 'simulator') {
    return verifySimulator(payload);
  }

  // Live
  if (payload.forceVerisys || process.env.NADRA_ALLOW_VERISYS === '1') {
    if (payload.biometricTemplate || payload.biometricOk) {
      return verifyBioVerisys(payload);
    }
    return verifyVerisys(payload);
  }

  // Default live path: Bio-Verisys (SBP digital / BV preference)
  if (biometricRequired() && !payload.biometricOk && !payload.biometricTemplate) {
    return {
      provider: 'NADRA',
      mode: 'live',
      status: 'biometric_required',
      verified: false,
      match_score: 0,
      message: 'Capture biometric, then retry verify',
      biometric_required: true,
      citizen: null,
      reference: ref('BIO-REQ'),
      raw: null,
    };
  }
  return verifyBioVerisys(payload);
}

function configPublic() {
  const live = mode() === 'live';
  return {
    provider: 'NADRA',
    mode: mode(),
    live_configured: !!(process.env.NADRA_API_URL && (process.env.NADRA_API_KEY || process.env.NADRA_CLIENT_SECRET)),
    biometric_required: biometricRequired(),
    verisys_allowed: process.env.NADRA_ALLOW_VERISYS === '1',
    mandatory_for_kyc: process.env.NADRA_MANDATORY !== '0',
    endpoints: {
      verify: 'POST /api/v1/nadra/verify',
      bio: 'POST /api/v1/nadra/bio-verify',
      verisys: 'POST /api/v1/nadra/verisys',
      history: 'GET /api/v1/nadra/history',
      config: 'GET /api/v1/nadra/config',
    },
    note: live
      ? 'Live mode — traffic goes to NADRA_API_URL gateway (map vendor response in mapLiveResponse).'
      : 'Simulator only. Set NADRA_MODE=live and gateway credentials for production.',
  };
}

module.exports = {
  mode,
  normalizeCnic,
  validCnicFormat,
  verifyIdentity,
  verifySimulator,
  verifyVerisys,
  verifyBioVerisys,
  verifyLive: verifyVerisys, // backward compatible name
  mapLiveResponse,
  configPublic,
};
