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
        { href: 'members.html', label: 'Member register' },
        { href: 'member360.html', label: 'Member 360' },
        { href: 'cards.html', label: 'Membership cards' },
      ],
    },
    {
      sec: 'Accounts',
      items: [
        { href: 'savings.html', label: 'Deposit accounts' },
        { href: 'shares.html', label: 'Share capital' },
        { href: 'cbs.html', label: 'Open account / CIF' },
      ],
    },
    {
      sec: 'Lending',
      items: [
        { href: 'loans.html', label: 'Loan portfolio' },
        { href: 'collateral.html', label: 'Collateral' },
        { href: 'murabaha.html', label: 'Murābaḥah' },
        { href: 'islamic-ops.html', label: 'Other Islamic modes' },
      ],
    },
    {
      sec: 'Operations',
      items: [
        { href: 'core-banking.html', label: 'General ledger' },
        { href: 'instruments.html', label: 'Cheque books' },
        { href: 'eod.html', label: 'End of day' },
        { href: 'cbs.html#txn', label: 'Transfers' },
      ],
    },
    {
      sec: 'Risk & compliance',
      items: [
        { href: 'mfb.html', label: 'Asset quality & capital' },
        { href: 'compliance.html', label: 'Cooperative law' },
        { href: 'registration.html', label: 'Licensing checklist' },
        { href: 'islamic.html', label: 'Shariah catalogue' },
      ],
    },
    {
      sec: 'Administration',
      items: [
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
