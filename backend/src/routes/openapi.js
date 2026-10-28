const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const specPath = path.join(__dirname, '../../openapi/openapi.yaml');

router.get('/openapi.yaml', (_req, res) => {
  if (!fs.existsSync(specPath)) {
    return res.status(404).json({ error: 'OpenAPI spec not found' });
  }
  res.type('text/yaml').send(fs.readFileSync(specPath, 'utf8'));
});

router.get('/openapi.json', (_req, res, next) => {
  try {
    // minimal YAML→JSON not required; return path info
    res.json({
      openapi: '3.0.3',
      info: { title: 'DigiFyntek CBS API', version: '1.3.0' },
      spec_url: '/api/openapi.yaml',
      note: 'Full document is served as YAML at /api/openapi.yaml',
    });
  } catch (e) {
    next(e);
  }
});

/** Lightweight catalog derived from static list for UI without YAML parse */
router.get('/catalog', (_req, res) => {
  res.json({
    version: '1.3.0',
    auth: 'Bearer JWT via POST /api/auth/login',
    groups: [
      {
        name: 'Foundation',
        endpoints: [
          { method: 'POST', path: '/api/auth/login', note: 'JWT' },
          { method: 'GET', path: '/health', note: 'Liveness' },
          { method: 'GET', path: '/api/v1/rbac/me', note: 'Permissions' },
        ],
      },
      {
        name: 'Customers',
        endpoints: [
          { method: 'GET/POST', path: '/api/v1/cif' },
          { method: 'GET/POST', path: '/api/v1/kyc' },
          { method: 'POST', path: '/api/v1/kyc/:id/decide', perm: 'kyc.decide' },
        ],
      },
      {
        name: 'Accounts & ledger',
        endpoints: [
          { method: 'GET/POST', path: '/api/v1/accounts' },
          { method: 'POST', path: '/api/v1/accounts/:id/deposit' },
          { method: 'POST', path: '/api/v1/accounts/:id/withdraw' },
          { method: 'POST', path: '/api/v1/ledger/journals', perm: 'ledger.post' },
          { method: 'GET', path: '/api/v1/ledger/trial-balance' },
        ],
      },
      {
        name: 'Lending & TD',
        endpoints: [
          { method: 'POST', path: '/api/v1/financing/disburse', perm: 'loan.disburse' },
          { method: 'POST', path: '/api/v1/financing/:id/repay', perm: 'loan.repay' },
          { method: 'POST', path: '/api/v1/term-deposits', perm: 'td.write' },
        ],
      },
      {
        name: 'Controls',
        endpoints: [
          { method: 'POST', path: '/api/v1/approvals/:id/approve', perm: 'approval.decide' },
          { method: 'POST', path: '/api/eod/run', perm: 'eod.run' },
          { method: 'POST', path: '/api/v1/teller/drawers/open', perm: 'teller.ops' },
          { method: 'POST', path: '/api/v1/payments/raast/outbound', perm: 'payments.post', note: 'SIMULATOR' },
        ],
      },
      {
        name: 'Ops',
        endpoints: [
          { method: 'POST', path: '/api/v1/clearing/batches' },
          { method: 'POST', path: '/api/v1/recon/statements' },
          { method: 'GET', path: '/api/openapi.yaml', note: 'This OpenAPI snapshot' },
        ],
      },
    ],
  });
});

module.exports = router;
