/**
 * DigiFyntek API client — wire phase1 HTML → Express MySQL backend
 * Default: http://localhost:4000
 * Override: localStorage.DIGIFYNTEK_API_BASE = 'https://your-api'
 */
(function (global) {
  const BASE = localStorage.getItem('DIGIFYNTEK_API_BASE') || (typeof location !== 'undefined' && /^https?:/.test(location.origin) ? location.origin : 'http://localhost:4000');

  function token() {
    return localStorage.getItem('DIGIFYNTEK_TOKEN') || '';
  }

  function user() {
    try {
      return JSON.parse(localStorage.getItem('DIGIFYNTEK_USER') || 'null');
    } catch {
      return null;
    }
  }

  function setSession(t, u) {
    if (t) localStorage.setItem('DIGIFYNTEK_TOKEN', t);
    if (u) localStorage.setItem('DIGIFYNTEK_USER', JSON.stringify(u));
  }

  function clearSession() {
    localStorage.removeItem('DIGIFYNTEK_TOKEN');
    localStorage.removeItem('DIGIFYNTEK_USER');
  }

  function requireAuth(redirect) {
    if (!token()) {
      window.location.href = redirect || 'index.html';
      return false;
    }
    return true;
  }

  async function request(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json', Accept: 'application/json' },
      options.headers || {}
    );
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;

    const res = await fetch(BASE + path, Object.assign({}, options, { headers }));
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const api = {
    BASE,
    token,
    user,
    setSession,
    clearSession,
    requireAuth,
    request,

    login(userId, password) {
      return request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId, password }),
      }).then((data) => {
        setSession(data.token, data.user);
        return data;
      });
    },

    logout() {
      clearSession();
      window.location.href = 'app.html';
    },

    kpis() {
      return request('/api/dashboard/kpis');
    },

    members(params) {
      const q = new URLSearchParams(params || {}).toString();
      return request('/api/members' + (q ? '?' + q : ''));
    },

    member360(id) {
      return request('/api/members/' + id + '/360');
    },

    createMember(body) {
      return request('/api/members', { method: 'POST', body: JSON.stringify(body) });
    },

    updateMember(id, body) {
      return request('/api/members/' + id, { method: 'PUT', body: JSON.stringify(body) });
    },

    loans() {
      return request('/api/loans');
    },

    portfolio() {
      return request('/api/loans/portfolio');
    },

    loanProducts() {
      return request('/api/loans/products');
    },

    createLoan(body) {
      return request('/api/loans', { method: 'POST', body: JSON.stringify(body) });
    },

    collaterals() {
      return request('/api/collateral');
    },

    guarantees() {
      return request('/api/collateral/guarantees');
    },

    instruments(params) {
      const q = params ? new URLSearchParams(params).toString() : '';
      return request('/api/instruments' + (q ? '?' + q : ''));
    },
    instrumentSummary() { return request('/api/instruments/summary'); },
    createInstrument(body) {
      return request('/api/instruments', { method: 'POST', body: JSON.stringify(body) });
    },
    setInstrumentStatus(id, status) {
      return request('/api/instruments/' + id + '/status', {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
    },

    cards() {
      return request('/api/cards');
    },

    checklist() {
      return request('/api/compliance/checklist');
    },

    toggleChecklist(id, is_done) {
      return request('/api/compliance/checklist/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ is_done }),
      });
    },

    setup() {
      return request('/api/compliance/setup');
    },

    saveSetup(body) {
      return request('/api/compliance/setup', { method: 'PUT', body: JSON.stringify(body) });
    },

    islamicSalam() { return request('/api/islamic/salam'); },
    islamicIjarah() { return request('/api/islamic/ijarah'); },
    islamicQard() { return request('/api/islamic/qard'); },

    murabahaList() {
      return request('/api/murabaha');
    },

    murabahaGet(id) {
      return request('/api/murabaha/' + id);
    },

    murabahaCreate(body) {
      return request('/api/murabaha', { method: 'POST', body: JSON.stringify(body) });
    },

    fmtPKR(n) {
      const x = Number(n) || 0;
      if (x >= 1e6) return 'PKR ' + (x / 1e6).toFixed(1) + 'M';
      if (x >= 1e3) return 'PKR ' + (x / 1e3).toFixed(1) + 'K';
      return 'PKR ' + x.toLocaleString();
    },

    initials(name) {
      return String(name || '?')
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    },
  };

  
    api.coreSummary = function () { return request('/api/core/summary'); };
    api.coreCoa = function () { return request('/api/core/coa'); };
    api.coreGlBalances = function (vacCode) {
      return request('/api/core/gl-balances' + (vacCode ? '?vacCode=' + encodeURIComponent(vacCode) : ''));
    };
    api.coreDepositProducts = function () { return request('/api/core/products/deposits'); };
    api.coreLoanProducts = function () { return request('/api/core/products/loans'); };
    api.coreTransactions = function () { return request('/api/core/transactions'); };
    api.coreStatement = function (accountNo) {
      return request('/api/core/statement/' + encodeURIComponent(accountNo));
    };
    api.corePosting = function (body) {
      return request('/api/core/posting', { method: 'POST', body: JSON.stringify(body) });
    };
    api.coreDayEnd = function (body) {
      return request('/api/core/day-end', { method: 'POST', body: JSON.stringify(body || {}) });
    };
    api.coreAccrual = function (body) {
      return request('/api/core/accrual', { method: 'POST', body: JSON.stringify(body || {}) });
    };
    api.coreUnposted = function () { return request('/api/core/unposted-count'); };
    
    api.cbsSummary = function () { return request('/api/cbs/summary'); };
    api.cbsCustomers = function (q) { return request('/api/cbs/customers' + (q ? '?q=' + encodeURIComponent(q) : '')); };
    api.cbsCreateCustomer = function (b) { return request('/api/cbs/customers', { method: 'POST', body: JSON.stringify(b) }); };
    api.cbsAccounts = function (q) { return request('/api/cbs/accounts' + (q ? '?q=' + encodeURIComponent(q) : '')); };
    api.cbsOpenAccount = function (b) { return request('/api/cbs/accounts', { method: 'POST', body: JSON.stringify(b) }); };
    api.cbsProducts = function () { return request('/api/cbs/products'); };
    api.cbsTxns = function () { return request('/api/cbs/transactions'); };
    api.cbsTransfer = function (b) { return request('/api/cbs/transfers', { method: 'POST', body: JSON.stringify(b) }); };
    api.cbsIntegrations = function () { return request('/api/cbs/integrations'); };
    api.cbsSbp = function () { return request('/api/cbs/sbp-controls'); };
    
    api.mfbSummary = function () { return request('/api/mfb/summary'); };
    api.mfbConfig = function () { return request('/api/mfb/config'); };
    api.mfbUpdateConfig = function (b) { return request('/api/mfb/config', { method: 'PUT', body: JSON.stringify(b) }); };
    api.mfbLoans = function (q) { return request('/api/mfb/loans' + (q ? '?q=' + encodeURIComponent(q) : '')); };
    api.mfbUpsertLoan = function (b) { return request('/api/mfb/loans', { method: 'POST', body: JSON.stringify(b) }); };
    api.mfbReclassify = function () { return request('/api/mfb/reclassify', { method: 'POST', body: '{}' }); };
    api.mfbPack = function () { return request('/api/mfb/regulatory-pack'); };
    api.mfbImportLegacy = function () { return request('/api/mfb/import-legacy', { method: 'POST', body: '{}' }); };
    
    api.eodStatus = function () { return request('/api/eod/status'); };
    api.eodRun = function (b) { return request('/api/eod/run', { method: 'POST', body: JSON.stringify(b || {}) }); };
    api.eodSetDate = function (d) { return request('/api/eod/business-date', { method: 'PUT', body: JSON.stringify({ business_date: d }) }); };
    global.DigiFyntekAPI = api;




})(window);

/** Load enabled product packs from server (client deploy config) */
DigiFyntekAPI.loadProductConfig = async function () {
  try {
    var r = await DigiFyntekAPI.request('/api/products');
    window.__DIGI_PRODUCTS__ = r;
    try {
      if (r && r.packs) localStorage.setItem('DIGIFYNTEK_PACKS', r.packs.join(','));
    } catch (e) {}
    return r;
  } catch (e) {
    return null;
  }
};
