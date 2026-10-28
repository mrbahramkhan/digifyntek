
  // Theme: default light, optional dark via localStorage
  (function initTheme() {
    var saved = localStorage.getItem('DIGIFYNTEK_THEME');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  })();

/** DigiFyntek — unified application shell (one bank / society system) */
(function (g) {
  /**
   * Information architecture
   * 1 Home · 2 Customers · 3 Accounts · 4 Lending · 5 Operations · 6 Risk · 7 Admin
   */
  const NAV = [
    {
      sec: 'Home',
      items: [{ href: 'app.html', label: 'Dashboard', icon: '◈' }],
    },
    {
      sec: 'Customers',
      items: [
        { href: 'cif.html', label: 'CIF / Customers' },
        { href: 'kyc.html', label: 'KYC cases' },
        // EXTRA: { href: 'members.html', label: 'Member register (legacy)' },
        // EXTRA: { href: 'member360.html', label: 'Member 360' },
        // EXTRA: { href: 'cards.html', label: 'Membership cards' },
      ],
    },
    {
      sec: 'Accounts',
      items: [
        { href: 'accounts.html', label: 'Accounts (CASA)' },
        { href: 'term-deposits.html', label: 'Term deposits' },
        { href: 'casa.html', label: 'Cash deposit / withdraw' },
        { href: 'teller.html', label: 'Teller / cash drawer' },
        // EXTRA: { href: 'savings.html', label: 'Deposit accounts (legacy)' },
        // EXTRA: { href: 'shares.html', label: 'Share capital' },
        // EXTRA: { href: 'cbs.html', label: 'Open account / CIF' }, // use cif.html + accounts.html
      ],
    },
    {
      sec: 'Lending',
      items: [
        { href: 'financing.html', label: 'Disburse financing' },
        // EXTRA: { href: 'loans.html', label: 'Loan portfolio (legacy)' },
        // EXTRA: { href: 'collateral.html', label: 'Collateral' },
        // EXTRA (enable when Islamic product pack live): { href: 'murabaha.html', label: 'Murābaḥah' },
        // EXTRA: { href: 'islamic-ops.html', label: 'Other Islamic modes' },
      ],
    },
    {
      sec: 'Operations',
      items: [
        { href: 'ledger.html', label: 'Journal & trial balance' },
        { href: 'transfer.html', label: 'Internal transfer' },
        // EXTRA: { href: 'core-banking.html', label: 'General ledger (legacy)' },
        { href: 'instruments.html', label: 'Cheque books' },
        { href: 'clearing.html', label: 'Cheque clearing' },
        { href: 'recon.html', label: 'Reconciliation' },
        { href: 'eod.html', label: 'End of day' },
        { href: 'approvals.html', label: 'Maker-checker queue' },
        { href: 'payments.html', label: 'Payments hub (sim)' },
        // EXTRA: { href: 'cbs.html#txn', label: 'Transfers' }, // use transfer.html
      ],
    },
    {
      sec: 'Risk & compliance',
      items: [
        // EXTRA (MFB pack): { href: 'mfb.html', label: 'Asset quality & capital' },
        // EXTRA: { href: 'compliance.html', label: 'Cooperative law' },
        // EXTRA: { href: 'registration.html', label: 'Licensing checklist' },
        // EXTRA: { href: 'islamic.html', label: 'Shariah catalogue' },
      ],
    },
    {
      sec: 'Administration',
      items: [
        { href: 'rbac.html', label: 'Roles & permissions' },
        { href: 'api-catalog.html', label: 'API catalog' },
        { href: 'checklist.html', label: 'Production checklist' },
        { href: 'setup.html', label: 'Institution & branches' },
      ],
    },
  ];

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
        location.href = 'app.html';
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
