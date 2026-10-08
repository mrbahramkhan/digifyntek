/**
 * Forge API client — wire phase1 HTML → Express MySQL backend
 * Default: http://localhost:4000
 * Override: localStorage.FORGE_API_BASE = 'https://your-api'
 */
(function (global) {
  const BASE = localStorage.getItem('FORGE_API_BASE') || (typeof location !== 'undefined' && /^https?:/.test(location.origin) ? location.origin : 'http://localhost:4000');

  function token() {
    return localStorage.getItem('FORGE_TOKEN') || '';
  }

  function user() {
    try {
      return JSON.parse(localStorage.getItem('FORGE_USER') || 'null');
    } catch {
      return null;
    }
  }

  function setSession(t, u) {
    if (t) localStorage.setItem('FORGE_TOKEN', t);
    if (u) localStorage.setItem('FORGE_USER', JSON.stringify(u));
  }

  function clearSession() {
    localStorage.removeItem('FORGE_TOKEN');
    localStorage.removeItem('FORGE_USER');
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
      window.location.href = 'index.html';
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

    instruments() {
      return request('/api/instruments');
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

  global.ForgeAPI = api;
})(window);
