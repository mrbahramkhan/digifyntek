const path = require('path');
const env = require('./config/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./services/logger');
const { ping } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
// EXTRA/legacy (disabled): const memberRoutes = require('./routes/members');
// EXTRA/legacy (disabled): const loanRoutes = require('./routes/loans');
// EXTRA/legacy (disabled): const collateralRoutes = require('./routes/collateral');
const instrumentRoutes = require('./routes/instruments');
// EXTRA/legacy (disabled): const cardRoutes = require('./routes/cards');
// EXTRA/legacy (disabled): const complianceRoutes = require('./routes/compliance');
// EXTRA/legacy (disabled): const dashboardRoutes = require('./routes/dashboard');
// EXTRA/legacy (disabled): const murabahaRoutes = require('./routes/murabaha');
// EXTRA/legacy (disabled): const islamicRoutes = require('./routes/islamic');
// EXTRA/legacy (disabled): const sharesRoutes = require('./routes/shares');
// EXTRA/legacy (disabled): const savingsRoutes = require('./routes/savings');
// EXTRA/legacy (disabled): const vacsRoutes = require('./routes/vacs');
// EXTRA/legacy (disabled): const coreBankingRoutes = require('./routes/corebanking');
// EXTRA/legacy (disabled): const cbsRoutes = require('./routes/cbs');
// EXTRA/legacy (disabled): const mfbRoutes = require('./routes/mfb');
const eodRoutes = require('./routes/eod');
const cifRoutes = require('./routes/cif');
const accountsRoutes = require('./routes/accounts');
const ledgerRoutes = require('./routes/ledger');
const financingRoutes = require('./routes/financing');
const approvalsRoutes = require('./routes/approvals');
const paymentsRoutes = require('./routes/payments');
const kycRoutes = require('./routes/kyc');
const termDepositRoutes = require('./routes/termdeposits');
const tellerRoutes = require('./routes/teller');
const clearingRoutes = require('./routes/clearing');
const reconRoutes = require('./routes/recon');
const rbacRoutes = require('./routes/rbac');
const openapiRoutes = require('./routes/openapi');

const app = express();

if (env.trustProxy) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (!env.isProd) return cb(null, true);
      if (env.corsOrigins.includes(origin)) return cb(null, true);
      // demo tunnels + same-host UI
      try {
        const u = new URL(origin);
        if (u.hostname.endsWith('.trycloudflare.com')) return cb(null, true);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return cb(null, true);
      } catch (_) {}
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});
const loginLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.loginRateLimitMax,
  message: { error: 'Too many login attempts' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

app.get('/health', async (_req, res) => {
  let db = 'unknown';
  try {
    const pool = require('./config/db');
    await pool.query('SELECT 1');
    db = 'up';
  } catch (e) {
    db = 'down';
  }
  res.json({
    ok: true,
    product: 'DigiFyntek',
    version: '1.2.0',
    db,
    modules: [
      // Core CBS (active)
      'auth', 'cif', 'kyc', 'accounts', 'ledger', 'financing', 'term-deposits',
      'approvals', 'payments-sim', 'teller', 'clearing', 'recon', 'eod', 'rbac',
      'instruments', 'openapi',
      // EXTRA/legacy disabled in this build: members, loans, shares, savings, vacs,
      // core-banking, cbs, mfb, murabaha, islamic, collateral, cards, compliance, dashboard
    ],
    modes: {
      legacy: process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1',
      db_name: process.env.DB_NAME || 'digifyntek',
    },
  });
});

app.get('/ready', async (_req, res) => {
  try {
    await ping();
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

app.use('/api/auth', authRoutes);
// EXTRA/legacy (disabled): app.use('/api/members', memberRoutes);
// EXTRA/legacy (disabled): app.use('/api/loans', loanRoutes);
// EXTRA/legacy (disabled): app.use('/api/collateral', collateralRoutes);
app.use('/api/instruments', instrumentRoutes);
// EXTRA/legacy (disabled): app.use('/api/cards', cardRoutes);
// EXTRA/legacy (disabled): app.use('/api/compliance', complianceRoutes);
// EXTRA/legacy (disabled): app.use('/api/dashboard', dashboardRoutes);
// EXTRA/legacy (disabled): app.use('/api/murabaha', murabahaRoutes);
// EXTRA/legacy (disabled): app.use('/api/islamic', islamicRoutes);
// EXTRA/legacy (disabled): app.use('/api/shares', sharesRoutes);
// EXTRA/legacy (disabled): app.use('/api/savings', savingsRoutes);
// EXTRA/legacy (disabled): app.use('/api/vacs', vacsRoutes);
// EXTRA/legacy (disabled): app.use('/api/core', coreBankingRoutes);
// EXTRA/legacy (disabled): app.use('/api/cbs', cbsRoutes);
// EXTRA/legacy (disabled): app.use('/api/mfb', mfbRoutes);
app.use('/api/eod', eodRoutes);
app.use('/api/v1/cif', cifRoutes);
app.use('/api/v1/accounts', accountsRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
// aliases
app.use('/api/cif', cifRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/v1/financing', financingRoutes);
app.use('/api/financing', financingRoutes);
app.use('/api/v1/approvals', approvalsRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/v1/term-deposits', termDepositRoutes);
app.use('/api/term-deposits', termDepositRoutes);
app.use('/api/v1/teller', tellerRoutes);
app.use('/api/teller', tellerRoutes);
app.use('/api/v1/clearing', clearingRoutes);
app.use('/api/clearing', clearingRoutes);
app.use('/api/v1/recon', reconRoutes);
app.use('/api/recon', reconRoutes);
app.use('/api/v1/rbac', rbacRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api', openapiRoutes);

// Serve full UI (phase1) from same process — one deploy = full system
const fs = require('fs');
const uiCandidates = [
  process.env.UI_ROOT,
  path.join(__dirname, '../../phase1'),
  path.join(__dirname, '../phase1'),
  path.join(process.cwd(), 'phase1'),
].filter(Boolean);
const uiRoot = uiCandidates.find((d) => { try { return fs.existsSync(d); } catch { return false; } }) || uiCandidates[1];
app.use(express.static(uiRoot, { index: 'index.html', extensions: ['html'] }));

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  logger.info(`DigiFyntek full system on :${env.port}`, { env: env.nodeEnv, ui: uiRoot });
});

function shutdown(signal) {
  logger.info('shutdown', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
