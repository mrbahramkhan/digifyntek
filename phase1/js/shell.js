/** Shared nav + logout for DigiFyntek phase1 pages */
(function (g) {
  const LINKS = [
    { sec: 'Overview', items: [
      { href: 'index.html', label: 'Dashboard' },
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
        location.href = 'index.html';
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

  g.DigiFyntekShell = { enhanceNav: enhanceNav, injectLogout: injectLogout, pageName: pageName };

  document.addEventListener('DOMContentLoaded', function () {
    try {
      enhanceNav();
      injectLogout();
      if (g.DigiFyntekAPI && pageName() !== 'index.html') {
        DigiFyntekAPI.requireAuth('index.html');
      }
    } catch (e) {
      console.warn(e);
    }
  });
})(window);
