/**
 * DigiFyntek workbench — SBP-oriented modules
 */
(function () {
  if (!window.DigiFyntekAPI || !DigiFyntekAPI.token()) {
    location.replace('login.html?next=app.html');
    return;
  }

  function $(id) { return document.getElementById(id); }
  function msg(el, text, ok) {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }
  function api(path, opts) { return DigiFyntekAPI.request(path, opts); }

  var titles = {
    home: ['Home', 'SBP workbench'],
    customer: ['CIF / CDD', 'Customer due diligence'],
    kyc: ['KYC / AML', 'Cases & screening'],
    account: ['Account opening', 'CASA'],
    cash: ['Cash', 'Deposit / withdrawal'],
    transfer: ['Transfer', 'Internal'],
    td: ['Term deposits', 'Placement'],
    loan: ['Credit / financing', 'Disburse & repay'],
    collateral: ['Collateral', 'Security'],
    instruments: ['Cheque books', 'Instruments'],
    clearing: ['Clearing', 'Cheques'],
    teller: ['Teller', 'Drawer'],
    ledger: ['General ledger', 'TB & journals'],
    eod: ['End of day', 'Close'],
    approvals: ['Maker-checker', 'Approvals'],
    'ai-report': ['AI / MIS reports', 'Reports'],
    members: ['Members', 'Cooperative'],
    sbp: ['SBP controls', 'Checklist'],
    roles: ['Users & roles', 'Access']
  };

  function show(name) {
    document.querySelectorAll('.panel-view').forEach(function (el) {
      el.classList.toggle('active', el.id === 'view-' + name);
    });
    document.querySelectorAll('.side-nav button[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    var t = titles[name] || [name, ''];
    $('pageTitle').textContent = t[0];
    $('pageMeta').textContent = t[1];
    var loaders = {
      home: loadHome, customer: loadCustomers, account: loadAccounts, kyc: loadKyc,
      approvals: loadApprovals, eod: loadEod, roles: loadRoles, collateral: loadCollateral,
      instruments: loadInstruments, clearing: loadClearing, teller: loadTeller,
      members: loadMembers, 'ai-report': initAi, loan: loadLoans
    };
    if (loaders[name]) loaders[name]();
  }

  document.getElementById('sideNav').onclick = function (e) {
    var b = e.target.closest('button[data-view]');
    if (b) show(b.getAttribute('data-view'));
  };
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.onclick = function () { show(b.getAttribute('data-go')); };
  });
  $('btnLogout').onclick = function () { DigiFyntekAPI.logout(); };
  $('btnTheme').onclick = function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('DIGIFYNTEK_THEME', 'light');
      this.textContent = '☾';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('DIGIFYNTEK_THEME', 'dark');
      this.textContent = '☀';
    }
  };
  if (document.documentElement.getAttribute('data-theme') === 'dark') $('btnTheme').textContent = '☀';


  var _dashCharts = {};
  function destroyChart(key) {
    if (_dashCharts[key]) {
      try { _dashCharts[key].destroy(); } catch (e) {}
      _dashCharts[key] = null;
    }
  }
  function chartColors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      text: dark ? '#94a3b8' : '#64748b',
      grid: dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)',
      brand: ['#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#155e75'],
      risk: { low: '#059669', medium: '#d97706', high: '#dc2626', unknown: '#94a3b8' },
      kyc: { verified: '#059669', pending: '#d97706', rejected: '#dc2626', manual_review: '#2563eb', unknown: '#94a3b8' },
      status: { active: '#059669', pending: '#d97706', restricted: '#dc2626', dormant: '#64748b', closed: '#94a3b8', unknown: '#94a3b8' }
    };
  }
  function countBy(rows, keyFn) {
    var m = {};
    (rows || []).forEach(function (r) {
      var k = keyFn(r) || 'unknown';
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  var _dashData = { customers: [], accounts: [] };
  var _dashTimer = null;

  function setDashInsight(text, rows) {
    var el = $('dashInsight');
    if (el) el.textContent = text || '';
    var wrap = $('dashInsightTable');
    var tb = $('dashInsightTb');
    if (!wrap || !tb) return;
    if (!rows || !rows.length) {
      wrap.style.display = 'none';
      tb.innerHTML = '';
      return;
    }
    wrap.style.display = 'block';
    tb.innerHTML = rows.slice(0, 25).map(function (r) {
      return '<tr style="cursor:pointer" data-jump="' + (r.jump || '') + '"><td>' + (r.ref || '') +
        '</td><td>' + (r.name || '') + '</td><td>' + (r.detail || '') + '</td></tr>';
    }).join('');
  }

  function renderDashCharts(customers, accounts) {
    if (typeof Chart === 'undefined') return;
    _dashData.customers = customers || [];
    _dashData.accounts = accounts || [];
    var C = chartColors();
    var common = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, color: C.text, font: { size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.9)',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8
        }
      }
    };

    function onProductClick(evt, elements) {
      if (!elements.length) return;
      var i = elements[0].index;
      var label = _dashCharts.products.data.labels[i];
      var list = _dashData.accounts.filter(function (a) { return (a.product_code || 'OTHER') === label; });
      setDashInsight('Product ' + label + ' — ' + list.length + ' account(s). Click row hint: open Accounts.', list.map(function (a) {
        return { ref: a.account_no || a.id, name: a.account_title || a.product_code, detail: (a.status || '') + ' · bal ' + (a.ledger_balance != null ? a.ledger_balance : a.balance || 0), jump: 'account' };
      }));
      if ($('dashFilterNote')) $('dashFilterNote').textContent = 'Filter: product ' + label;
    }
    function onRiskClick(evt, elements) {
      if (!elements.length) return;
      var i = elements[0].index;
      var label = _dashCharts.risk.data.labels[i];
      var key = String(label).toLowerCase();
      var list = _dashData.customers.filter(function (c) { return (c.risk_rating || 'unknown').toLowerCase() === key; });
      setDashInsight('Risk ' + label + ' — ' + list.length + ' customer(s).', list.map(function (c) {
        return { ref: c.customer_no || c.id, name: c.full_name, detail: (c.kyc_status || '') + ' · ' + (c.cnic || ''), jump: 'customer' };
      }));
      if ($('dashFilterNote')) $('dashFilterNote').textContent = 'Filter: risk ' + label;
    }
    function onKycClick(evt, elements) {
      if (!elements.length) return;
      var i = elements[0].index;
      var label = _dashCharts.kyc.data.labels[i];
      var key = String(label).replace(/\s+/g, '_').toLowerCase();
      var list = _dashData.customers.filter(function (c) { return (c.kyc_status || 'unknown').toLowerCase() === key; });
      setDashInsight('KYC ' + label + ' — ' + list.length + ' customer(s).', list.map(function (c) {
        return { ref: c.customer_no || c.id, name: c.full_name, detail: (c.risk_rating || '') + ' · ' + (c.cnic || ''), jump: 'kyc' };
      }));
      if ($('dashFilterNote')) $('dashFilterNote').textContent = 'Filter: KYC ' + label;
    }
    function onStatusClick(evt, elements) {
      if (!elements.length) return;
      var i = elements[0].index;
      var label = _dashCharts.acctStatus.data.labels[i];
      var list = _dashData.accounts.filter(function (a) { return (a.status || 'unknown').toLowerCase() === String(label).toLowerCase(); });
      setDashInsight('Status ' + label + ' — ' + list.length + ' account(s).', list.map(function (a) {
        return { ref: a.account_no || a.id, name: a.product_code, detail: a.status, jump: 'account' };
      }));
      if ($('dashFilterNote')) $('dashFilterNote').textContent = 'Filter: status ' + label;
    }
    function onBalanceClick(evt, elements) {
      if (!elements.length) return;
      var i = elements[0].index;
      var acc = (_dashData.accounts || []).slice().sort(function (a, b) {
        return Number(b.ledger_balance || b.balance || 0) - Number(a.ledger_balance || a.balance || 0);
      })[i];
      if (!acc) return;
      setDashInsight('Account ' + (acc.account_no || acc.id), [{
        ref: acc.account_no || acc.id,
        name: acc.account_title || acc.product_code,
        detail: 'Balance ' + (acc.ledger_balance != null ? acc.ledger_balance : acc.balance || 0),
        jump: 'account'
      }]);
      if ($('dashFilterNote')) $('dashFilterNote').textContent = 'Selected: ' + (acc.account_no || acc.id);
    }

    destroyChart('products');
    var prod = countBy(accounts, function (a) { return a.product_code || 'OTHER'; });
    var pLabels = Object.keys(prod);
    var pEl = document.getElementById('chartProducts');
    if (pEl) {
      _dashCharts.products = new Chart(pEl, {
        type: 'bar',
        data: {
          labels: pLabels,
          datasets: [{
            label: 'Accounts',
            data: pLabels.map(function (k) { return prod[k]; }),
            backgroundColor: C.brand,
            borderRadius: 6,
            maxBarThickness: 36
          }]
        },
        options: {
          ...common,
          onClick: onProductClick,
          plugins: { ...common.plugins, legend: { display: false } },
          scales: {
            x: { ticks: { color: C.text, font: { size: 10 } }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: C.text, precision: 0 }, grid: { color: C.grid } }
          }
        }
      });
    }

    destroyChart('risk');
    var risk = countBy(customers, function (c) { return (c.risk_rating || 'unknown').toLowerCase(); });
    var rLabels = Object.keys(risk);
    var rEl = document.getElementById('chartRisk');
    if (rEl) {
      _dashCharts.risk = new Chart(rEl, {
        type: 'doughnut',
        data: {
          labels: rLabels.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }),
          datasets: [{
            data: rLabels.map(function (k) { return risk[k]; }),
            backgroundColor: rLabels.map(function (k) { return C.risk[k] || C.risk.unknown; }),
            borderWidth: 0,
            hoverOffset: 8
          }]
        },
        options: { ...common, cutout: '62%', onClick: onRiskClick }
      });
    }

    destroyChart('kyc');
    var kyc = countBy(customers, function (c) { return (c.kyc_status || 'unknown').toLowerCase(); });
    var kLabels = Object.keys(kyc);
    var kEl = document.getElementById('chartKyc');
    if (kEl) {
      _dashCharts.kyc = new Chart(kEl, {
        type: 'doughnut',
        data: {
          labels: kLabels.map(function (x) { return x.replace(/_/g, ' '); }),
          datasets: [{
            data: kLabels.map(function (k) { return kyc[k]; }),
            backgroundColor: kLabels.map(function (k) { return C.kyc[k] || C.kyc.unknown; }),
            borderWidth: 0,
            hoverOffset: 8
          }]
        },
        options: { ...common, cutout: '62%', onClick: onKycClick }
      });
    }

    destroyChart('acctStatus');
    var st = countBy(accounts, function (a) { return (a.status || 'unknown').toLowerCase(); });
    var sLabels = Object.keys(st);
    var sEl = document.getElementById('chartAcctStatus');
    if (sEl) {
      _dashCharts.acctStatus = new Chart(sEl, {
        type: 'bar',
        data: {
          labels: sLabels,
          datasets: [{
            label: 'Count',
            data: sLabels.map(function (k) { return st[k]; }),
            backgroundColor: sLabels.map(function (k) { return C.status[k] || C.status.unknown; }),
            borderRadius: 6,
            maxBarThickness: 40
          }]
        },
        options: {
          ...common,
          indexAxis: 'y',
          onClick: onStatusClick,
          plugins: { ...common.plugins, legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { color: C.text, precision: 0 }, grid: { color: C.grid } },
            y: { ticks: { color: C.text }, grid: { display: false } }
          }
        }
      });
    }

    destroyChart('balances');
    var sorted = (accounts || []).slice().sort(function (a, b) {
      return Number(b.ledger_balance || b.balance || 0) - Number(a.ledger_balance || a.balance || 0);
    }).slice(0, 8);
    var bEl = document.getElementById('chartBalances');
    if (bEl) {
      _dashCharts.balances = new Chart(bEl, {
        type: 'bar',
        data: {
          labels: sorted.map(function (a) { return a.account_no || ('#' + a.id); }),
          datasets: [{
            label: 'Ledger balance (PKR)',
            data: sorted.map(function (a) { return Number(a.ledger_balance || a.balance || 0); }),
            backgroundColor: 'rgba(14, 116, 144, 0.75)',
            borderRadius: 6,
            maxBarThickness: 28
          }]
        },
        options: {
          ...common,
          onClick: onBalanceClick,
          plugins: { ...common.plugins, legend: { display: false } },
          scales: {
            x: { ticks: { color: C.text, maxRotation: 45, minRotation: 0, font: { size: 9 } }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: C.text }, grid: { color: C.grid } }
          }
        }
      });
    }
  }

  async function loadHome() {
    function set(id, v) { var el = $(id); if (el) el.textContent = v; }
    var customers = [], accounts = [];
    try {
      var c = await api('/api/v1/cif?limit=500');
      customers = Array.isArray(c) ? c : (c.rows || []);
      set('kCif', customers.length);
    } catch (e) { set('kCif', '—'); }
    try {
      var a = await api('/api/v1/accounts?limit=500');
      accounts = Array.isArray(a) ? a : (a.rows || []);
      set('kAcct', accounts.length);
    } catch (e) { set('kAcct', '—'); }
    try {
      var p = await api('/api/v1/approvals?status=pending&limit=20');
      set('kAppr', (p.rows || (Array.isArray(p) ? p : [])).length);
    } catch (e) { set('kAppr', '0'); }
    try {
      var eod = await api('/api/v1/eod/status');
      var st = (eod && (eod.status || eod.state || eod.business_date)) || 'Ready';
      set('kEod', st);
    } catch (e) { set('kEod', '—'); }
    try {
      renderDashCharts(customers, accounts);
    } catch (e) {
      console.warn('charts', e);
    }
    var u = $('dashUpdated');
    if (u) u.textContent = 'Updated ' + new Date().toLocaleTimeString();
    // rebind data-go on new KPI buttons
    document.querySelectorAll('#view-home [data-go]').forEach(function (b) {
      b.onclick = function () { show(b.getAttribute('data-go')); };
    });
  }

  $('btnDashRefresh') && ($('btnDashRefresh').onclick = function () { loadHome(); });
  $('dashAutoRefresh') && ($('dashAutoRefresh').onchange = function () {
    if (_dashTimer) { clearInterval(_dashTimer); _dashTimer = null; }
    if ($('dashAutoRefresh').checked) {
      _dashTimer = setInterval(function () {
        if (document.getElementById('view-home') && document.getElementById('view-home').classList.contains('active')) {
          loadHome();
        }
      }, 30000);
    }
  });
  $('dashInsightTb') && ($('dashInsightTb').onclick = function (e) {
    var tr = e.target.closest('tr[data-jump]');
    if (!tr) return;
    var j = tr.getAttribute('data-jump');
    if (j) show(j);
  });

  /* ——— CIF / CDD ——— */
  var custRows = [];
  async function loadCustomers() {
    try {
      var c = await api('/api/v1/cif?limit=300');
      custRows = Array.isArray(c) ? c : (c.rows || []);
      renderCust();
    } catch (e) {
      $('custTb').innerHTML = '<tr><td colspan="5">' + (e.message || e) + '</td></tr>';
    }
  }
  function renderCust() {
    var q = ($('custQ').value || '').toLowerCase();
    var rows = custRows.filter(function (r) {
      return !q || [r.full_name, r.cnic, r.customer_no, r.id, r.risk_rating].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    $('custTb').innerHTML = rows.map(function (r) {
      return '<tr data-id="' + r.id + '" style="cursor:pointer"><td>' + r.id + '</td><td>' +
        (r.full_name || '') + '</td><td>' + (r.cnic || '') + '</td><td>' + (r.risk_rating || '') +
        '</td><td>' + (r.kyc_status || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No customers</td></tr>';
  }
  $('custQ') && ($('custQ').oninput = renderCust);
  $('custTb') && ($('custTb').onclick = function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    var r = custRows.find(function (x) { return String(x.id) === tr.dataset.id; });
    if (!r) return;
    fillCustomer(r);
  });
  function setVal(id, v) { var el = $(id); if (el) el.value = v == null ? '' : v; }
  function fillCustomer(r) {
    setVal('c_id', r ? r.id : '');
    setVal('c_name', r ? r.full_name : '');
    setVal('c_idtype', r ? (r.id_type || 'CNIC') : 'CNIC');
    setVal('c_cnic', r ? r.cnic : '');
    setVal('c_cnic_issue', r && r.cnic_issue ? String(r.cnic_issue).slice(0, 10) : '');
    setVal('c_cnic_exp', r && r.cnic_expiry ? String(r.cnic_expiry).slice(0, 10) : '');
    setVal('c_father', r ? (r.father_or_husband || r.father_name) : '');
    setVal('c_mother', r ? r.mother_name : '');
    setVal('c_dob', r && r.dob ? String(r.dob).slice(0, 10) : '');
    setVal('c_pob', r ? r.place_of_birth : '');
    setVal('c_gender', r ? (r.gender || 'M') : 'M');
    setVal('c_marital', r ? r.marital_status : '');
    setVal('c_nationality', r ? (r.nationality || 'Pakistani') : 'Pakistani');
    setVal('c_type', r ? (r.customer_type || 'individual') : 'individual');
    setVal('c_phone', r ? (r.phone || r.mobile) : '');
    setVal('c_landline', r ? r.landline : '');
    setVal('c_email', r ? r.email : '');
    setVal('c_addr', r ? r.address : '');
    setVal('c_present', r ? r.present_address : '');
    setVal('c_city', r ? r.city : '');
    setVal('c_province', r ? r.province : '');
    setVal('c_country', r ? (r.country || 'Pakistan') : 'Pakistan');
    setVal('c_br', r ? (r.branch_code || '001') : '001');
    setVal('c_occ', r ? r.occupation : '');
    setVal('c_nob', r ? r.nature_of_business : '');
    setVal('c_employer', r ? r.employer_name : '');
    setVal('c_sof', r ? r.source_of_funds : '');
    setVal('c_income', r ? r.monthly_income : '');
    setVal('c_turnover', r ? r.expected_turnover : '');
    setVal('c_purpose', r ? r.purpose_of_account : '');
    setVal('c_ntn', r ? r.ntn : '');
    setVal('c_tax', r && r.tax_resident === 0 ? '0' : '1');
    setVal('c_kin_name', r ? r.next_of_kin_name : '');
    setVal('c_kin_rel', r ? r.next_of_kin_relation : '');
    setVal('c_kin_phone', r ? r.next_of_kin_phone : '');
    setVal('c_bo', r ? r.beneficial_owner : '');
    setVal('c_risk', r ? (r.risk_rating || 'low') : 'low');
    setVal('c_aml', r ? (r.aml_risk || r.risk_rating || 'low') : 'low');
    setVal('c_pep', r && (r.is_pep || r.pep_flag) ? '1' : '0');
    setVal('c_kyc', r ? (r.kyc_status || 'pending') : 'pending');
    setVal('c_status', r ? (r.status || 'active') : 'active');
    setVal('c_notes', r ? r.notes : '');
    setVal('c_biz_name', r ? r.business_name : '');
    setVal('c_biz_ntn', r ? r.business_ntn : '');
    setVal('c_biz_reg', r ? r.business_reg_no : '');
    setVal('c_sales_tax', r ? r.sales_tax_no : '');
    setVal('c_trade_body', r ? r.trade_body_membership : '');
    setVal('c_sp_decl', r && Number(r.sole_prop_declaration) === 1 ? '1' : '0');
    setVal('c_sp_req', r && Number(r.account_request_letterhead) === 1 ? '1' : '0');
    setVal('c_sp_text', r ? r.sole_prop_declaration_text : '');
    setVal('c_sp_by', r ? r.sole_prop_declared_by : '');
    setVal('c_sp_date', r && r.sole_prop_declared_at ? String(r.sole_prop_declared_at).slice(0, 10) : '');
    if ($('c_frontPrev')) {
      if (r && r.cnic_front_path) { $('c_frontPrev').src = r.cnic_front_path; $('c_frontPrev').style.display = 'block'; }
      else { $('c_frontPrev').style.display = 'none'; }
    }
    if ($('c_backPrev')) {
      if (r && r.cnic_back_path) { $('c_backPrev').src = r.cnic_back_path; $('c_backPrev').style.display = 'block'; }
      else { $('c_backPrev').style.display = 'none'; }
    }
  }
  $('btnCustNew') && ($('btnCustNew').onclick = function () { fillCustomer(null); });

  $('btnOpenKyc') && ($('btnOpenKyc').onclick = async function () {
    var id = $('c_id') && $('c_id').value;
    if (!id) return msg('custMsg', 'Pehle CIF save karein', false);
    try {
      var row = await api('/api/v1/kyc', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: Number(id),
          case_type: 'onboarding',
          risk_rating: ($('c_risk') && $('c_risk').value) || 'low',
          source_of_funds: ($('c_sof') && $('c_sof').value) || null,
          purpose_of_account: ($('c_purpose') && $('c_purpose').value) || null
        })
      });
      msg('custMsg', 'KYC case opened #' + (row.id || row.case_id || ''), true);
    } catch (e) {
      msg('custMsg', e.message || e, false);
    }
  });


  function applyCitizen(c, meta) {
    if (!c) return;
    if (c.full_name) $('c_name').value = c.full_name;
    if (c.cnic) $('c_cnic').value = String(c.cnic).replace(/\D/g, '');
    if (c.father_or_husband) $('c_father').value = c.father_or_husband;
    if (c.date_of_birth) $('c_dob').value = String(c.date_of_birth).slice(0, 10);
    if (c.gender) $('c_gender').value = String(c.gender).toUpperCase().charAt(0);
    if (c.permanent_address || c.address) $('c_addr').value = c.permanent_address || c.address;
    if (c.city) $('c_city').value = c.city;
    if (meta && meta.verified) $('c_kyc').value = 'verified';
  }
  async function nadraFetch(bioOk) {
    var cnic = ($('c_cnic').value || '').replace(/\D/g, '');
    if (cnic.length !== 13) return msg('custMsg', '13-digit CNIC required', false);
    if (!bioOk) {
      $('bioCnic').textContent = cnic;
      $('bioScan').className = 'bio-scan';
      $('bioOverlay').classList.add('open');
      return;
    }
    msg('custMsg', 'NADRA…', true);
    try {
      var r = await api('/api/v1/nadra/verify', {
        method: 'POST',
        body: JSON.stringify({
          cnic: cnic, biometric_ok: true, biometric_template: 'BIO-' + cnic,
          customer_id: $('c_id').value || undefined
        })
      });
      if (r.verified && r.citizen) {
        applyCitizen(r.citizen, r);
        msg('custMsg', 'NADRA verified — review & save', true);
      } else msg('custMsg', r.message || r.status || 'Failed', false);
    } catch (e) { msg('custMsg', e.message || e, false); }
  }
  $('btnNadra') && ($('btnNadra').onclick = function () { nadraFetch(false); });
  var cnicT;
  $('c_cnic') && $('c_cnic').addEventListener('input', function () {
    var raw = this.value.replace(/\D/g, '');
    clearTimeout(cnicT);
    if (raw.length === 13) cnicT = setTimeout(function () {
      $('c_cnic').value = raw;
      nadraFetch(false);
    }, 500);
  });
  $('btnBio') && ($('btnBio').onclick = function () {
    $('bioScan').className = 'bio-scan ok';
    $('bioScan').textContent = 'Captured';
    setTimeout(function () {
      $('bioOverlay').classList.remove('open');
      nadraFetch(true);
    }, 400);
  });
  $('btnBioX') && ($('btnBioX').onclick = function () { $('bioOverlay').classList.remove('open'); });

  $('frmCust') && ($('frmCust').onsubmit = async function (e) {
    e.preventDefault();
    function gv(id) { var el = $(id); return el ? el.value.trim() : ''; }
    var body = {
      full_name: gv('c_name'),
      id_type: gv('c_idtype') || 'CNIC',
      cnic: gv('c_cnic').replace(/\D/g, ''),
      cnic_issue: gv('c_cnic_issue') || null,
      cnic_expiry: gv('c_cnic_exp') || null,
      father_or_husband: gv('c_father'),
      father_name: gv('c_father'),
      mother_name: gv('c_mother'),
      dob: gv('c_dob') || null,
      place_of_birth: gv('c_pob'),
      gender: gv('c_gender'),
      marital_status: gv('c_marital') || null,
      nationality: gv('c_nationality') || 'Pakistani',
      customer_type: gv('c_type'),
      phone: gv('c_phone'),
      mobile: gv('c_phone'),
      landline: gv('c_landline'),
      email: gv('c_email'),
      address: gv('c_addr'),
      present_address: gv('c_present'),
      city: gv('c_city'),
      province: gv('c_province'),
      country: gv('c_country') || 'Pakistan',
      branch_code: gv('c_br'),
      occupation: gv('c_occ'),
      nature_of_business: gv('c_nob'),
      employer_name: gv('c_employer'),
      source_of_funds: gv('c_sof'),
      monthly_income: gv('c_income') ? Number(gv('c_income')) : null,
      expected_turnover: gv('c_turnover') ? Number(gv('c_turnover')) : null,
      purpose_of_account: gv('c_purpose'),
      ntn: gv('c_ntn'),
      tax_resident: gv('c_tax') !== '0',
      next_of_kin_name: gv('c_kin_name'),
      next_of_kin_relation: gv('c_kin_rel'),
      next_of_kin_phone: gv('c_kin_phone'),
      beneficial_owner: gv('c_bo'),
      risk_rating: gv('c_risk'),
      aml_risk: gv('c_aml'),
      is_pep: gv('c_pep') === '1',
      kyc_status: gv('c_kyc'),
      status: gv('c_status'),
      notes: gv('c_notes'),
      business_name: gv('c_biz_name'),
      business_ntn: gv('c_biz_ntn'),
      business_reg_no: gv('c_biz_reg'),
      sales_tax_no: gv('c_sales_tax'),
      trade_body_membership: gv('c_trade_body'),
      sole_prop_declaration: gv('c_sp_decl') === '1',
      sole_prop_declaration_text: gv('c_sp_text'),
      sole_prop_declared_by: gv('c_sp_by'),
      sole_prop_declared_at: gv('c_sp_date') || null,
      account_request_letterhead: gv('c_sp_req') === '1' 
    };
    try {
      var id = $('c_id').value;
      if (id) await api('/api/v1/cif/' + id, { method: 'PUT', body: JSON.stringify(body) });
      else {
        var created = await api('/api/v1/cif', { method: 'POST', body: JSON.stringify(body) });
        if (created && created.id) $('c_id').value = created.id;
      }
      msg('custMsg', 'CIF saved (CDD)', true);
      loadCustomers();
    } catch (err) { msg('custMsg', err.message || err, false); }
  });

  /* ——— Accounts ——— */
  async function loadAccounts() {
    try {
      var a = await api('/api/v1/accounts?limit=100');
      var rows = Array.isArray(a) ? a : [];
      $('acctTb').innerHTML = rows.map(function (r) {
        return '<tr><td>' + r.id + '</td><td>' + (r.account_no || '') + '</td><td>' +
          (r.account_title || '') + '</td><td>' + (r.customer_id || '') + '</td><td>' +
          (r.product_code || '') + '</td><td>' +
          (r.ledger_balance != null ? r.ledger_balance : 0) + '</td><td>' + (r.status || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="7">None</td></tr>';
    } catch (e) {
      $('acctTb').innerHTML = '<tr><td colspan="6">' + (e.message || '') + '</td></tr>';
    }
  }
  $('frmAcct') && ($('frmAcct').onsubmit = async function (e) {
    e.preventDefault();
    function ag(id) { var el = $(id); return el ? el.value.trim() : ''; }
    try {
      var body = {
        customer_id: Number(ag('a_cust')),
        product_code: ag('a_prod'),
        branch_code: ag('a_br') || '001',
        status: ag('a_status') || 'pending',
        open_date: ag('a_odate') || null,
        account_title: ag('a_title') || null,
        purpose_of_account: ag('a_purpose'),
        source_of_funds: ag('a_sof') || null,
        expected_monthly_turnover: ag('a_turnover') ? Number(ag('a_turnover')) : null,
        initial_deposit: ag('a_init') ? Number(ag('a_init')) : 0,
        risk_rating: ag('a_risk') || null,
        mode_of_operation: ag('a_mode') || 'self',
        operating_instructions: ag('a_mode') || 'self',
        statement_frequency: ag('a_stmt') || 'monthly',
        cheque_book_required: ag('a_chq') === '1',
        debit_card_required: ag('a_card') === '1',
        internet_banking: ag('a_ib') === '1',
        sms_alerts: ag('a_sms') !== '0',
        nominee_name: ag('a_nom_name') || null,
        nominee_relation: ag('a_nom_rel') || null,
        nominee_cnic: ag('a_nom_cnic') || null,
        kyc_cleared: ag('a_kyc') === '1',
        notes: ag('a_notes') || null
      };
      if (!body.purpose_of_account) {
        msg('acctMsg', 'Purpose of account required (SBP)', false);
        return;
      }
      var row = await api('/api/v1/accounts', { method: 'POST', body: JSON.stringify(body) });
      msg('acctMsg', 'Opened ' + (row.account_no || '') + ' · status ' + (row.status || '') + ' · id=' + row.id, true);
      loadAccounts();
    } catch (err) { msg('acctMsg', err.message || err, false); }
  });

  /* ——— Cash ——— */
  $('frmCash') && ($('frmCash').onsubmit = async function (e) {
    e.preventDefault();
    var id = $('x_id').value.trim();
    var type = $('x_type').value;
    var nar = ($('x_nar') && $('x_nar').value.trim()) || '';
    if (!nar) return msg('cashMsg', 'Purpose / narrative required', false);
    var parts = [nar];
    if ($('x_sof') && $('x_sof').value.trim()) parts.push('SOF:' + $('x_sof').value.trim());
    if ($('x_party') && $('x_party').value.trim()) parts.push('Party:' + $('x_party').value.trim());
    if ($('x_cnic') && $('x_cnic').value.trim()) parts.push('CNIC:' + $('x_cnic').value.trim());
    if ($('x_edd') && $('x_edd').value.trim()) parts.push('EDD:' + $('x_edd').value.trim());
    try {
      var body = {
        amount: Number($('x_amt').value),
        narrative: parts.join(' | '),
        business_date: ($('x_date') && $('x_date').value) || undefined
      };
      await api('/api/v1/accounts/' + id + '/' + type, { method: 'POST', body: JSON.stringify(body) });
      msg('cashMsg', 'Posted ' + type, true);
    } catch (err) { msg('cashMsg', err.message || err, false); }
  });

  /* ——— Transfer ——— */
  $('frmXfer') && ($('frmXfer').onsubmit = async function (e) {
    e.preventDefault();
    var nar = ($('xf_nar') && $('xf_nar').value.trim()) || '';
    if (!nar) return msg('xferMsg', 'Purpose required', false);
    if ($('xf_ref') && $('xf_ref').value.trim()) nar += ' | REF:' + $('xf_ref').value.trim();
    var body = {
      from_account_id: Number($('xf_from').value),
      to_account_id: Number($('xf_to').value),
      amount: Number($('xf_amt').value),
      narrative: nar,
      business_date: ($('xf_date') && $('xf_date').value) || undefined
    };
    try {
      await api('/api/v1/ledger/transfer', { method: 'POST', body: JSON.stringify(body) });
      msg('xferMsg', 'Transfer OK', true);
    } catch (err) {
      try {
        await api('/api/v1/ledger/transfers', { method: 'POST', body: JSON.stringify(body) });
        msg('xferMsg', 'Transfer OK', true);
      } catch (e2) { msg('xferMsg', e2.message || err.message, false); }
    }
  });

  /* ——— TD ——— */
  $('frmTd') && ($('frmTd').onsubmit = async function (e) {
    e.preventDefault();
    var body = {
      customer_id: Number($('t_cust').value),
      principal: Number($('t_amt').value),
      tenor_days: Number($('t_days').value),
      rate_pct: Number($('t_rate').value),
      product_code: $('t_prod').value,
      branch_code: ($('t_br') && $('t_br').value) || '001',
      maturity_instruction: ($('t_mat') && $('t_mat').value) || undefined,
      source_of_funds: ($('t_sof') && $('t_sof').value.trim()) || undefined,
      purpose: ($('t_purpose') && $('t_purpose').value.trim()) || undefined
    };
    if ($('t_fund') && $('t_fund').value.trim()) body.funding_account_id = Number($('t_fund').value);
    try {
      var r = await api('/api/v1/term-deposits', { method: 'POST', body: JSON.stringify(body) });
      msg('tdMsg', 'TD placed ' + (r.td_no || r.id || ''), true);
    } catch (err) { msg('tdMsg', err.message || err, false); }
  });

  /* ——— Loan ——— */
  async function loadLoans() {
    try {
      var r = await api('/api/v1/financing?limit=50');
      var rows = r.rows || (Array.isArray(r) ? r : []);
      if ($('loanTb')) {
        $('loanTb').innerHTML = rows.map(function (x) {
          return '<tr><td>' + (x.id || '') + '</td><td>' + (x.contract_no || '') + '</td><td>' +
            (x.customer_id || '') + '</td><td>' + (x.principal || '') + '</td><td>' + (x.status || '') + '</td></tr>';
        }).join('') || '<tr><td colspan="5">None</td></tr>';
      }
    } catch (e) {}
  }
  $('frmLoan') && ($('frmLoan').onsubmit = async function (e) {
    e.preventDefault();
    var purpose = ($('l_purpose') && $('l_purpose').value.trim()) || '';
    if (!purpose) return msg('loanMsg', 'Purpose of financing required (SBP)', false);
    var body = {
      customer_id: Number($('l_cust').value),
      product_code: $('l_prod').value,
      principal: Number($('l_amt').value),
      rate_pct: Number($('l_rate').value),
      tenor_months: ($('l_tenor') && $('l_tenor').value) ? Number($('l_tenor').value) : undefined,
      branch_code: $('l_br').value,
      is_islamic: $('l_isl').value === '1',
      islamic_mode: $('l_mode').value || null,
      purpose: purpose,
      source_of_repayment: ($('l_repay_src') && $('l_repay_src').value.trim()) || undefined,
      security_ref: ($('l_sec') && $('l_sec').value.trim()) || undefined,
      risk_rating: ($('l_risk') && $('l_risk').value) || undefined,
      narrative: (($('l_nar') && $('l_nar').value) || 'Disbursement') + ' | Purpose:' + purpose
    };
    if ($('l_acct') && $('l_acct').value.trim()) body.credit_account_id = Number($('l_acct').value);
    try {
      var r = await api('/api/v1/financing/disburse', { method: 'POST', body: JSON.stringify(body) });
      msg('loanMsg', 'Disbursed ' + (r.contract_no || r.id || ''), true);
      loadLoans();
    } catch (err) { msg('loanMsg', err.message || err, false); }
  });
  $('frmRepay') && ($('frmRepay').onsubmit = async function (e) {
    e.preventDefault();
    try {
      await api('/api/v1/financing/' + $('r_id').value.trim() + '/repay', {
        method: 'POST', body: JSON.stringify({ amount: Number($('r_amt').value), narrative: ($('r_nar') && $('r_nar').value) || 'Repayment' })
      });
      msg('repayMsg', 'Repayment posted', true);
    } catch (err) { msg('repayMsg', err.message || err, false); }
  });

  /* ——— Collateral ——— */
  async function loadCollateral() {
    try {
      var r = await api('/api/v1/collateral?limit=50').catch(function () {
        return api('/api/collateral?limit=50');
      });
      var rows = r.rows || (Array.isArray(r) ? r : []);
      $('colTb').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.id || '') + '</td><td>' + (x.customer_id || '') + '</td><td>' +
          (x.collateral_type || x.type || '') + '</td><td>' + (x.value || x.forced_sale_value || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">None</td></tr>';
    } catch (e) {
      $('colTb').innerHTML = '<tr><td colspan="4">' + (e.message || '') + '</td></tr>';
    }
  }
  $('frmCol') && ($('frmCol').onsubmit = async function (e) {
    e.preventDefault();
    var body = {
      customer_id: Number($('col_cust').value),
      collateral_type: $('col_type').value,
      description: $('col_desc').value,
      value: Number($('col_val').value),
      forced_sale_value: Number(($('col_fsv') && $('col_fsv').value) || $('col_val').value),
      facility_ref: ($('col_fac') && $('col_fac').value.trim()) || undefined,
      valuation_date: ($('col_vdate') && $('col_vdate').value) || undefined,
      valuer: ($('col_valuer') && $('col_valuer').value.trim()) || undefined,
      ownership_proof: ($('col_proof') && $('col_proof').value === '1')
    };
    try {
      await api('/api/v1/collateral', { method: 'POST', body: JSON.stringify(body) }).catch(function () {
        return api('/api/collateral', { method: 'POST', body: JSON.stringify(body) });
      });
      msg('colMsg', 'Collateral registered', true);
      loadCollateral();
    } catch (err) { msg('colMsg', err.message || err, false); }
  });

  /* ——— Instruments ——— */
  async function loadInstruments() {
    try {
      var r = await api('/api/instruments?limit=50').catch(function () {
        return api('/api/v1/instruments?limit=50');
      });
      var rows = r.rows || (Array.isArray(r) ? r : []);
      $('instTb').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.id || '') + '</td><td>' + (x.book_no || '') + '</td><td>' +
          (x.account_no || '') + '</td><td>' + (x.status || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">None</td></tr>';
    } catch (e) {
      $('instTb').innerHTML = '<tr><td colspan="4">' + (e.message || '') + '</td></tr>';
    }
  }
  $('frmInst') && ($('frmInst').onsubmit = async function (e) {
    e.preventDefault();
    if ($('inst_kyc') && $('inst_kyc').value === '0') {
      return msg('instMsg', 'Confirm KYC / active account before issue', false);
    }
    var body = {
      account_no: $('inst_acct').value.trim(),
      member_ref: ($('inst_mem') && $('inst_mem').value.trim()) || undefined,
      branch_code: $('inst_br').value,
      leaves: Number($('inst_leaves').value) || 25,
      delivery_mode: ($('inst_del') && $('inst_del').value) || 'branch',
      remarks: ($('inst_rmk') && $('inst_rmk').value.trim()) || undefined
    };
    try {
      await api('/api/instruments', { method: 'POST', body: JSON.stringify(body) });
      msg('instMsg', 'Cheque book issued', true);
      loadInstruments();
    } catch (err) { msg('instMsg', err.message || err, false); }
  });

  /* ——— Clearing ——— */
  async function loadClearing() {
    try {
      var r = await api('/api/v1/clearing?limit=50').catch(function () {
        return api('/api/clearing?limit=50');
      });
      var rows = r.rows || (Array.isArray(r) ? r : []);
      $('clrTb').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.id || '') + '</td><td>' + (x.cheque_no || '') + '</td><td>' +
          (x.amount || '') + '</td><td>' + (x.status || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">None</td></tr>';
    } catch (e) {
      $('clrTb').innerHTML = '<tr><td colspan="4">' + (e.message || '') + '</td></tr>';
    }
  }

  /* ——— Teller ——— */
  async function loadTeller() {
    try {
      var r = await api('/api/v1/teller/drawers').catch(function () {
        return api('/api/teller/drawers');
      });
      var rows = r.rows || (Array.isArray(r) ? r : []);
      $('telTb').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.id || '') + '</td><td>' + (x.drawer_code || x.code || '') +
          '</td><td>' + (x.balance || x.cash_balance || '') + '</td><td>' + (x.status || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">None / open drawer via API</td></tr>';
    } catch (e) {
      $('telTb').innerHTML = '<tr><td colspan="4">' + (e.message || '') + '</td></tr>';
    }
  }

  /* ——— Members ——— */
  async function loadMembers() {
    try {
      var r = await api('/api/v1/members?limit=50').catch(function () {
        return api('/api/members?limit=50');
      });
      var rows = r.rows || (Array.isArray(r) ? r : []);
      $('memTb').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.id || '') + '</td><td>' + (x.member_no || '') + '</td><td>' +
          (x.full_name || x.name || '') + '</td><td>' + (x.status || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">None</td></tr>';
    } catch (e) {
      $('memTb').innerHTML = '<tr><td colspan="4">' + (e.message || '') + '</td></tr>';
    }
  }
  $('frmMem') && ($('frmMem').onsubmit = async function (e) {
    e.preventDefault();
    var body = {
      full_name: $('m_name').value.trim(),
      cnic: $('m_cnic').value.trim(),
      phone: $('m_phone').value.trim(),
      branch_code: ($('m_br') && $('m_br').value) || '001',
      father_or_husband: ($('m_father') && $('m_father').value.trim()) || undefined,
      member_type: ($('m_type') && $('m_type').value) || 'regular',
      share_units: ($('m_shares') && $('m_shares').value) ? Number($('m_shares').value) : 1,
      address: ($('m_addr') && $('m_addr').value.trim()) || undefined
    };
    try {
      await api('/api/v1/members', { method: 'POST', body: JSON.stringify(body) }).catch(function () {
        return api('/api/members', { method: 'POST', body: JSON.stringify(body) });
      });
      msg('memMsg', 'Member saved', true);
      loadMembers();
    } catch (err) { msg('memMsg', err.message || err, false); }
  });

  /* ——— KYC ——— */
  async function loadKyc() {
    try {
      var r = await api('/api/v1/kyc?limit=50');
      var rows = r.rows || (Array.isArray(r) ? r : []);
      $('kycTb').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.id || '') + '</td><td>' + (x.customer_id || '') +
          '</td><td>' + (x.status || '') + '</td><td>' + (x.risk_rating || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">None</td></tr>';
    } catch (e) {
      if ($('kycMsg')) $('kycMsg').textContent = e.message || e;
    }
  }
  $('btnKycLoad') && ($('btnKycLoad').onclick = loadKyc);

  /* ——— Ledger / EOD / Approvals ——— */
  $('btnTb') && ($('btnTb').onclick = async function () {
    try {
      var r = await api('/api/v1/reports/trial-balance').catch(function () {
        return api('/api/v1/ledger/trial-balance');
      });
      var rows = r.rows || r.lines || (Array.isArray(r) ? r : []);
      $('tbBody').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.account_code || x.gl_code || '') + '</td><td>' +
          (x.debit || x.dr || '') + '</td><td>' + (x.credit || x.cr || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="3">Empty</td></tr>';
      msg('tbMsg', 'Loaded ' + rows.length, true);
    } catch (e) { msg('tbMsg', e.message || e, false); }
  });
  async function loadEod() {
    try {
      var s = await api('/api/v1/eod/status');
      $('eodStatus').textContent = JSON.stringify(s, null, 2);
    } catch (e) { $('eodStatus').textContent = e.message || e; }
  }
  $('btnEodRef') && ($('btnEodRef').onclick = loadEod);
  $('btnEod') && ($('btnEod').onclick = async function () {
    try {
      await api('/api/v1/eod/run', { method: 'POST', body: '{}' });
      msg('eodMsg', 'EOD done', true);
      loadEod();
    } catch (e) { msg('eodMsg', e.message || e, false); }
  });
  async function loadApprovals() {
    try {
      var r = await api('/api/v1/approvals?limit=50');
      var rows = r.rows || (Array.isArray(r) ? r : []);
      $('apprTb').innerHTML = rows.map(function (x) {
        return '<tr><td>' + (x.id || '') + '</td><td>' + (x.request_type || x.type || '') +
          '</td><td>' + (x.status || '') + '</td><td>' + (x.created_by || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">None</td></tr>';
    } catch (e) {
      $('apprTb').innerHTML = '<tr><td colspan="4">' + (e.message || '') + '</td></tr>';
    }
  }
  $('btnAppr') && ($('btnAppr').onclick = loadApprovals);

  /* ——— Users & roles (simplified bind if elements exist) ——— */
  async function loadRoles() {
    try {
      var m = await api('/api/v1/rbac/me');
      if ($('roleBox')) {
        $('roleBox').innerHTML = '<strong>' + (m.userId || '') + '</strong> · ' + (m.role || '') +
          '<div style="margin-top:8px;font-size:11px">' + (m.permissions || []).join(', ') + '</div>';
      }
    } catch (e) {}
    try {
      var users = await api('/api/v1/users').catch(function () { return api('/api/v1/rbac/users'); });
      if (!Array.isArray(users)) users = [];
      if ($('rbacUserTb')) {
        $('rbacUserTb').innerHTML = users.map(function (u) {
          return '<tr data-uid="' + (u.user_id || u.id) + '" style="cursor:pointer"><td>' +
            (u.user_id || '') + '</td><td>' + (u.full_name || '') + '</td><td>' + (u.role || '') + '</td></tr>';
        }).join('');
      }
      if ($('rbac_role')) {
        var roles = await api('/api/v1/rbac/roles');
        $('rbac_role').innerHTML = (Array.isArray(roles) ? roles : []).map(function (r) {
          return '<option value="' + r.role_code + '">' + r.role_code + '</option>';
        }).join('');
      }
    } catch (e) {}
  }

  /* ——— AI ——— */
  var aiReady = false;
  function initAi() {
    if (aiReady) return;
    aiReady = true;
    var chips = ['customer list', 'account balances', 'trial balance', 'loan portfolio', 'pending approvals', 'NADRA history', 'EOD status'];
    if ($('aiChips')) {
      $('aiChips').innerHTML = chips.map(function (c) {
        return '<button type="button" class="btn btn-s" data-q="' + c + '">' + c + '</button>';
      }).join('');
      $('aiChips').onclick = function (e) {
        var b = e.target.closest('[data-q]');
        if (!b) return;
        $('aiPrompt').value = b.getAttribute('data-q');
        runAi();
      };
    }
    $('btnAiRun') && ($('btnAiRun').onclick = runAi);
  }
  async function runAi() {
    var prompt = ($('aiPrompt').value || '').trim();
    if (!prompt) return msg('aiMeta', 'Enter prompt', false);
    msg('aiMeta', 'Generating…', true);
    try {
      var r = await api('/api/v1/reports/ai', { method: 'POST', body: JSON.stringify({ prompt: prompt }) });
      if (!r.rows && r.message) return msg('aiMeta', r.message, false);
      msg('aiMeta', (r.title || '') + ' · ' + (r.summary || ''), true);
      var cols = r.columns || (r.rows && r.rows[0] ? Object.keys(r.rows[0]) : []);
      $('aiHead').innerHTML = '<tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
      $('aiBody').innerHTML = (r.rows || []).map(function (row) {
        return '<tr>' + cols.map(function (c) { return '<td>' + (row[c] != null ? row[c] : '') + '</td>'; }).join('') + '</tr>';
      }).join('') || '<tr><td>No rows</td></tr>';
    } catch (e) { msg('aiMeta', e.message || e, false); }
  }

  loadHome();
  window.DigiFyntekShow = show;
})();
