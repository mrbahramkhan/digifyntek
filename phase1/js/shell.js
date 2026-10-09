/** Shared nav + logout for DigiFyntek phase1 pages */
(function (g) {
  const LINKS = [
    { sec: 'Overview', items: [
      { href: 'app.html', label: 'Dashboard' },
    ]},
    { sec: 'CRM', items: [
      { href: 'members.html', label: 'Members' },
      { href: 'member360.html', label: 'Member 360' },
      { href: 'cards.html', label: 'Membership cards' },
      { href: 'shares.html', label: 'Shares' },
      { href: 'savings.html', label: 'Savings' },
    ]},
    { sec: 'Credit', items: [
      { href: 'loans.html', label: 'Loans & PAR' },
      { href: 'murabaha.html', label: 'Murābaḥah' },
      { href: 'islamic-ops.html', label: 'Salam · Ijārah · Qard' },
      { href: 'collateral.html', label: 'Collateral' },
      { href: 'instruments.html', label: 'Instruments' },
    ]},
    { sec: 'Governance', items: [
      { href: 'setup.html', label: 'Institution setup' },
      { href: 'registration.html', label: 'Registration checklist' },
      { href: 'compliance.html', label: 'Cooperative law' },
      { href: 'islamic.html', label: 'Islamic catalogue' },
    ]},
  ];

  function pageName() {
    const p = (location.pathname.split('/').pop() || 'index.html').split('?')[0];
    return p || 'index.html';
  }

  function injectLogout() {
    const top = document.querySelector('.topbar, header.topbar');
    if (!top || top.querySelector('.digifyntek-logout')) return;
    const btn = document.createElement('button');
    btn.className = 'digifyntek-logout';
    btn.textContent = 'Logout';
    btn.style.cssText =
      'margin-left:auto;height:32px;padding:0 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit';
    btn.onclick = function () {
      if (g.DigiFyntekAPI) DigiFyntekAPI.logout();
      else {
        localStorage.removeItem('FORGE_TOKEN');
        location.href = 'app.html';
      }
    };
    // place before avatar if present
    const av = top.querySelector('.av');
    if (av) top.insertBefore(btn, av);
    else top.appendChild(btn);
  }

  function enhanceNav() {
    const nav = document.querySelector('.nav, nav.nav');
    if (!nav) return;
    const cur = pageName();
    // Rebuild compact consistent nav if mostly empty anchors
    const html = LINKS.map(function (sec) {
      return (
        '<div class="sec"><div class="sec-t">' +
        sec.sec +
        '</div>' +
        sec.items
          .map(function (it) {
            const active = it.href === cur ? ' active' : '';
            return (
              '<a class="' +
              active.trim() +
              '" href="' +
              it.href +
              '">' +
              it.label +
              '</a>'
            );
          })
          .join('') +
        '</div>'
      );
    }).join('');
    nav.innerHTML = html;
  }

  
  function injectLogo() {
    document.querySelectorAll('.side-brand').forEach(function (el) {
      if (el.querySelector('img.df-logo')) return;
      var img = document.createElement('img');
      img.src = 'assets/logo.svg';
      img.alt = 'DigiFyntek';
      img.className = 'df-logo';
      img.width = 28;
      img.height = 28;
      img.style.cssText = 'border-radius:8px;flex-shrink:0';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '10px';
      el.insertBefore(img, el.firstChild);
    });
    // favicon once
    if (!document.querySelector('link[rel="icon"]')) {
      var link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.href = 'assets/favicon.svg';
      document.head.appendChild(link);
    }
  }

  
  function injectTheme() {
    if (document.getElementById('df-theme-css')) return;
    var style = document.createElement('style');
    style.id = 'df-theme-css';
    style.textContent = `
      [data-theme="dark"]{--bg:#0f172a;--surface:#1e293b;--ink:#f1f5f9;--ink-2:#94a3b8;--ink-3:#64748b;--border:#334155;--brand:#06b6d4;--brand-deep:#0e7490}
      [data-theme="dark"] body{background:var(--bg);color:var(--ink)}
      [data-theme="dark"] .card,[data-theme="dark"] .kpi,[data-theme="dark"] .topbar,[data-theme="dark"] .drawer{background:var(--surface)!important;color:var(--ink);border-color:var(--border)!important}
      [data-theme="dark"] table th{background:#0f172a;color:var(--ink-2)}
      [data-theme="dark"] input,[data-theme="dark"] select,[data-theme="dark"] textarea{background:#0f172a;color:var(--ink);border-color:var(--border)}
      [data-theme="dark"] .btn-s{background:var(--surface);color:var(--ink);border-color:var(--border)}
      .df-theme-btn{height:32px;padding:0 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;margin-left:8px}
      [data-theme="dark"] .df-theme-btn{background:#1e293b;color:#f1f5f9;border-color:#334155}
    `;
    document.head.appendChild(style);
    var saved = localStorage.getItem('DIGIFYNTEK_THEME') || 'light';
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    var top = document.querySelector('.topbar, header.topbar');
    if (!top || top.querySelector('.df-theme-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'df-theme-btn';
    btn.textContent = saved === 'dark' ? 'Light' : 'Dark';
    btn.onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('DIGIFYNTEK_THEME', next);
      btn.textContent = next === 'dark' ? 'Light' : 'Dark';
    };
    var logout = top.querySelector('.digifyntek-logout, .forge-logout');
    if (logout) top.insertBefore(btn, logout);
    else {
      var av = top.querySelector('.av');
      if (av) top.insertBefore(btn, av);
      else top.appendChild(btn);
    }
  }

  g.DigiFyntekShell = { enhanceNav: enhanceNav, injectLogout: injectLogout, injectLogo: injectLogo, injectTheme: injectTheme, pageName: pageName };

  document.addEventListener('DOMContentLoaded', function () {
    try {
      enhanceNav();
      injectLogout();
      injectLogo();
      injectTheme();
      if (g.DigiFyntekAPI && pageName() !== 'index.html') {
        DigiFyntekAPI.requireAuth('app.html');
      }
    } catch (e) {
      console.warn(e);
    }
  });
})(window);
