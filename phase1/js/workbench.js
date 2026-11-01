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

  async function loadHome() {
    try {
      var c = await api('/api/v1/cif?limit=500');
      $('kCif').textContent = (Array.isArray(c) ? c : []).length;
    } catch (e) {}
    try {
      var a = await api('/api/v1/accounts?limit=500');
      $('kAcct').textContent = (Array.isArray(a) ? a : []).length;
    } catch (e) {}
    try {
      var p = await api('/api/v1/approvals?status=pending&limit=20');
      $('kAppr').textContent = (p.rows || (Array.isArray(p) ? p : [])).length;
    } catch (e) {}
    try {
      var eod = await api('/api/v1/eod/status');
      $('kEod').textContent = (eod && (eod.status || eod.state)) || '—';
    } catch (e) {}
  }

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
  function fillCustomer(r) {
    $('c_id').value = r ? r.id : '';
    $('c_name').value = r ? (r.full_name || '') : '';
    $('c_cnic').value = r ? (r.cnic || '') : '';
    $('c_father').value = r ? (r.father_or_husband || '') : '';
    $('c_dob').value = r && r.dob ? String(r.dob).slice(0, 10) : '';
    $('c_gender').value = r ? (r.gender || 'M') : 'M';
    $('c_phone').value = r ? (r.phone || r.mobile || '') : '';
    $('c_email').value = r ? (r.email || '') : '';
    $('c_addr').value = r ? (r.address || '') : '';
    $('c_city').value = r ? (r.city || '') : '';
    $('c_occ').value = r ? (r.occupation || '') : '';
    $('c_sof').value = r ? (r.source_of_funds || '') : '';
    $('c_br').value = r ? (r.branch_code || '001') : '001';
    $('c_risk').value = r ? (r.risk_rating || 'low') : 'low';
    $('c_pep').value = r && r.is_pep ? '1' : '0';
    $('c_kyc').value = r ? (r.kyc_status || 'pending') : 'pending';
    $('c_status').value = r ? (r.status || 'active') : 'active';
    $('c_type').value = r ? (r.customer_type || 'individual') : 'individual';
    $('c_notes').value = r ? (r.notes || '') : '';
  }
  $('btnCustNew') && ($('btnCustNew').onclick = function () { fillCustomer(null); });

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
    var body = {
      full_name: $('c_name').value.trim(),
      cnic: $('c_cnic').value.replace(/\D/g, ''),
      father_or_husband: $('c_father').value.trim(),
      dob: $('c_dob').value || null,
      gender: $('c_gender').value,
      phone: $('c_phone').value.trim(),
      mobile: $('c_phone').value.trim(),
      email: $('c_email').value.trim(),
      address: $('c_addr').value.trim(),
      city: $('c_city').value.trim(),
      occupation: $('c_occ').value.trim(),
      source_of_funds: $('c_sof').value.trim(),
      branch_code: $('c_br').value.trim(),
      risk_rating: $('c_risk').value,
      is_pep: $('c_pep').value === '1',
      kyc_status: $('c_kyc').value,
      status: $('c_status').value,
      customer_type: $('c_type').value,
      notes: $('c_notes').value.trim()
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
          (r.customer_id || '') + '</td><td>' + (r.product_code || '') + '</td><td>' +
          (r.ledger_balance != null ? r.ledger_balance : 0) + '</td><td>' + (r.status || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="6">None</td></tr>';
    } catch (e) {
      $('acctTb').innerHTML = '<tr><td colspan="6">' + (e.message || '') + '</td></tr>';
    }
  }
  $('frmAcct') && ($('frmAcct').onsubmit = async function (e) {
    e.preventDefault();
    try {
      var row = await api('/api/v1/accounts', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: Number($('a_cust').value),
          product_code: $('a_prod').value,
          branch_code: $('a_br').value,
          status: $('a_status').value || 'active'
        })
      });
      msg('acctMsg', 'Opened ' + (row.account_no || '') + ' id=' + row.id, true);
      loadAccounts();
    } catch (err) { msg('acctMsg', err.message || err, false); }
  });

  /* ——— Cash ——— */
  $('frmCash') && ($('frmCash').onsubmit = async function (e) {
    e.preventDefault();
    var id = $('x_id').value.trim();
    var type = $('x_type').value;
    try {
      await api('/api/v1/accounts/' + id + '/' + type, {
        method: 'POST',
        body: JSON.stringify({ amount: Number($('x_amt').value), narrative: $('x_nar').value })
      });
      msg('cashMsg', 'Posted ' + type, true);
    } catch (err) { msg('cashMsg', err.message || err, false); }
  });

  /* ——— Transfer ——— */
  $('frmXfer') && ($('frmXfer').onsubmit = async function (e) {
    e.preventDefault();
    var body = {
      from_account_id: Number($('xf_from').value),
      to_account_id: Number($('xf_to').value),
      amount: Number($('xf_amt').value),
      narrative: $('xf_nar').value
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
      branch_code: $('t_br').value || '001'
    };
    if ($('t_fund').value.trim()) body.funding_account_id = Number($('t_fund').value);
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
    var body = {
      customer_id: Number($('l_cust').value),
      product_code: $('l_prod').value,
      principal: Number($('l_amt').value),
      rate_pct: Number($('l_rate').value),
      branch_code: $('l_br').value,
      is_islamic: $('l_isl').value === '1',
      islamic_mode: $('l_mode').value || null,
      narrative: $('l_nar').value
    };
    if ($('l_acct').value.trim()) body.credit_account_id = Number($('l_acct').value);
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
        method: 'POST', body: JSON.stringify({ amount: Number($('r_amt').value) })
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
      forced_sale_value: Number($('col_fsv').value || $('col_val').value)
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
    var body = {
      account_no: $('inst_acct').value.trim(),
      member_ref: $('inst_mem').value.trim(),
      branch_code: $('inst_br').value,
      leaves: Number($('inst_leaves').value) || 25
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
    try {
      await api('/api/v1/members', {
        method: 'POST',
        body: JSON.stringify({
          full_name: $('m_name').value.trim(),
          cnic: $('m_cnic').value.trim(),
          phone: $('m_phone').value.trim(),
          branch_code: $('m_br').value
        })
      }).catch(function () {
        return api('/api/members', {
          method: 'POST',
          body: JSON.stringify({
            full_name: $('m_name').value.trim(),
            cnic: $('m_cnic').value.trim(),
            phone: $('m_phone').value.trim()
          })
        });
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
