
  // Theme: default light, optional dark via localStorage
  (function initTheme() {
    var saved = localStorage.getItem('DIGIFYNTEK_THEME');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  })();

/** DigiFyntek — Conventional Banking · Islamic Banking · Agri App */
(function (g) {

  // Auth gate — dedicated login page
  try {
    var path = (location.pathname || '').split('/').pop() || '';
    if (path !== 'login.html' && path !== 'index.html' && typeof DigiFyntekAPI !== 'undefined') {
      if (!DigiFyntekAPI.token()) {
        location.replace('login.html?next=' + encodeURIComponent(path || 'app.html'));
      }
    }
  } catch (e) {}

  /**
   * Information architecture
   * 1 Home · 2 Customers · 3 Accounts · 4 Lending · 5 Operations · 6 Risk · 7 Admin
   */
  /**
   * Three primary lines: Conventional Banking · Islamic Banking · Agri App
   * localStorage DIGIFYNTEK_PACKS = "conventional,islamic,agri"
   * Aliases: core→conventional, kisaan→agri
   */
  function loadPacks() {
    try {
      var raw = localStorage.getItem('DIGIFYNTEK_PACKS');
      if (raw) {
        return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean).map(function (p) {
          if (p === 'core' || p === 'cbs' || p === 'fintech') return 'conventional';
          if (p === 'kisaan' || p === 'cooperative') return 'agri';
          return p;
        });
      }
    } catch (e) {}
    return ['conventional', 'islamic', 'agri', 'fmfb'];
  }

  var PACKS = loadPacks();
  // Server is source of truth when page set window.__DIGI_PRODUCTS__ (from /api/products)
  try {
    if (window.__DIGI_PRODUCTS__ && window.__DIGI_PRODUCTS__.packs && window.__DIGI_PRODUCTS__.packs.length) {
      PACKS = window.__DIGI_PRODUCTS__.packs.map(function (p) {
        if (p === 'core') return 'conventional';
        if (p === 'kisaan') return 'agri';
        return p;
      });
    }
  } catch (e) {}
  function hasPack(id) {
    if (id === 'core') id = 'conventional';
    if (id === 'kisaan') id = 'agri';
    return PACKS.indexOf(id) >= 0;
  }

  var NAV = [
    {
      sec: 'Home',
      items: [
        { href: 'app.html', label: 'Dashboard' },
        { href: 'app.html#packs', label: 'Product lines' },
      ],
    },
  ];

  // —— Conventional Banking ——
  if (hasPack('conventional')) {
    NAV.push(
      {
        sec: 'Conventional Banking',
        pack: 'conventional',
        items: [
          { href: 'conventional-dashboard.html', label: 'Conventional dashboard' },
          { href: 'cif.html', label: 'CIF / Customers' },
          { href: 'kyc.html', label: 'KYC cases' },
          { href: 'nadra.html', label: 'NADRA verification' },
        ],
      },
      {
        sec: 'Conventional · Accounts',
        pack: 'conventional',
        items: [
          { href: 'accounts.html', label: 'CASA accounts' },
          { href: 'term-deposits.html', label: 'Term deposits' },
          { href: 'casa.html', label: 'Cash deposit / withdraw' },
          { href: 'teller.html', label: 'Teller / cash drawer' },
        ],
      },
      {
        sec: 'Conventional · Lending',
        pack: 'conventional',
        items: [
          { href: 'financing.html', label: 'Disburse financing' },
          { href: 'products.html', label: 'Product catalogue' },
        ],
      },
      {
        sec: 'Conventional · Operations',
        pack: 'conventional',
        items: [
          { href: 'ledger.html', label: 'Journal & trial balance' },
          { href: 'transfer.html', label: 'Internal transfer' },
          { href: 'instruments.html', label: 'Cheque books' },
          { href: 'clearing.html', label: 'Cheque clearing' },
          { href: 'recon.html', label: 'Reconciliation' },
          { href: 'eod.html', label: 'End of day' },
          { href: 'reports.html', label: 'Reports' },
          { href: 'approvals.html', label: 'Maker-checker queue' },
          { href: 'payments.html', label: 'Payments hub (sim)' },
        ],
      }
    );
  }

  // —— Islamic Banking ——
  if (hasPack('islamic')) {
    NAV.push({
      sec: 'Islamic Banking',
      pack: 'islamic',
      items: [
        { href: 'islamic-dashboard.html', label: 'Islamic dashboard' },
        { href: 'products.html', label: 'Islamic products' },
        { href: 'accounts.html', label: 'Islamic deposits' },
        { href: 'financing.html', label: 'Islamic financing' },
        { href: 'term-deposits.html', label: 'Islamic TD' },
        { href: 'murabaha.html', label: 'Murābaḥah' },
        { href: 'islamic-ops.html', label: 'Other Islamic modes' },
        { href: 'islamic.html', label: 'Shariah catalogue' },
        { href: 'eod.html', label: 'EOD / profit accrual' },
      ],
    });
  }

  // —— Agri App (formerly Kisaan App) ——
  if (hasPack('agri') || hasPack('kisaan')) {
    NAV.push({
      sec: 'Agri App',
      pack: 'agri',
      items: [
        { href: 'agri-dashboard.html', label: 'Agri dashboard' },
        { href: 'members.html', label: 'Member register' },
        { href: 'member360.html', label: 'Member 360' },
        { href: 'cards.html', label: 'Membership cards' },
        { href: 'shares.html', label: 'Share capital' },
        { href: 'savings.html', label: 'Member deposits' },
        { href: 'setup.html', label: 'Branches / VAC' },
        { href: 'compliance.html', label: 'Cooperative law' },
        { href: 'registration.html', label: 'Licensing checklist' },
      ],
    });
  }

  // —— FMFB (optional) ——
  if (hasPack('fmfb')) {
    NAV.push({
      sec: 'FMFB · Microfinance',
      pack: 'fmfb',
      items: [
        { href: 'mfb.html', label: 'Asset quality & capital' },
        { href: 'loans.html', label: 'Loan portfolio' },
        { href: 'collateral.html', label: 'Collateral' },
        { href: 'core-banking.html', label: 'GL / core tools' },
      ],
    });
  }

  NAV.push({
    sec: 'Administration',
    items: [
      { href: 'rbac.html', label: 'Roles & permissions' },
      { href: 'api-catalog.html', label: 'API catalog' },
      { href: 'checklist.html', label: 'Production checklist' },
      { href: 'setup.html', label: 'Institution setup' },
    ],
  });

  function pageName() {
    const p = (location.pathname.split('/').pop() || 'index.html').split('?')[0];
    return p || 'index.html';
  }

  function baseHref(href) {
    return (href || '').split('#')[0];
  }

  function injectLogout() {
    const top = document.querySelector('.topbar, header.topbar');
    if (!top || top.querySelector('.digifyntek-logout')) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:10px';
    wrap.innerHTML =
      '<span style="font-size:12px;color:#6b7280;font-weight:500">DigiFyntek</span>' +
      '<button type="button" class="digifyntek-logout" style="height:32px;padding:0 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Logout</button>';
    wrap.querySelector('button').onclick = function () {
      if (g.DigiFyntekAPI && DigiFyntekAPI.logout) DigiFyntekAPI.logout();
      else {
        localStorage.removeItem('FORGE_TOKEN');
        localStorage.removeItem('DIGIFYNTEK_TOKEN');
        location.href = 'login.html';
      }
    };
    const av = top.querySelector('.av');
    if (av) top.insertBefore(wrap, av);
    else top.appendChild(wrap);
  }

  function enhanceNav() {
    const nav = document.querySelector('.nav, nav.nav');
    if (!nav) return;
    const cur = pageName();
    nav.innerHTML = NAV.map(function (sec) {
      const links = sec.items
        .map(function (it) {
          const file = baseHref(it.href);
          const on = cur === file || (cur === 'index.html' && file === 'app.html');
          return (
            '<a href="' +
            it.href +
            '" class="' +
            (on ? 'active' : '') +
            '">' +
            it.label +
            '</a>'
          );
        })
        .join('');
      return '<div class="nav-sec"><div class="sec-t">' + sec.sec + '</div>' + links + '</div>';
    }).join('');

    // Section title style if missing
    if (!document.getElementById('df-nav-style')) {
      const s = document.createElement('style');
      s.id = 'df-nav-style';
      s.textContent =
        '.nav .sec-t{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(236,254,255,.45);padding:14px 11px 6px}' +
        '.nav .nav-sec:first-child .sec-t{padding-top:4px}' +
        '.nav a{display:block;padding:7px 11px;border-radius:8px;color:rgba(236,254,255,.72);text-decoration:none;font-size:13px;font-weight:500}' +
        '.nav a:hover,.nav a.active{background:#0e7490;color:#fff}' +
        '.side-brand{font-size:15px;letter-spacing:-.02em}';
      document.head.appendChild(s);
    }

    // Brand text
    const brand = document.querySelector('.side-brand');
    if (brand && !brand.querySelector('.df-mark')) {
      brand.innerHTML =
        '<span class="df-mark" style="display:inline-flex;width:28px;height:28px;border-radius:8px;background:#06b6d4;align-items:center;justify-content:center;margin-right:8px;font-size:12px;font-weight:800;color:#fff">D</span>DigiFyntek';
    }
  }

  function boot() {
    enhanceNav();
    injectLogout();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);


  function ensureThemeToggle() {
    var bar = document.querySelector('.topbar');
    if (!bar || bar.querySelector('.theme-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.title = 'Toggle light / dark theme';
    btn.setAttribute('aria-label', 'Toggle theme');
    function syncIcon() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.textContent = dark ? '☀' : '☾';
    }
    syncIcon();
    btn.onclick = function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (dark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('DIGIFYNTEK_THEME', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('DIGIFYNTEK_THEME', 'dark');
      }
      syncIcon();
    };
    var spacer = bar.querySelector('.spacer');
    if (spacer) spacer.after(btn);
    else bar.appendChild(btn);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureThemeToggle);
  } else {
    ensureThemeToggle();
  }
