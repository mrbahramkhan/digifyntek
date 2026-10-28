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
const memberRoutes = require('./routes/members');
const loanRoutes = require('./routes/loans');
const collateralRoutes = require('./routes/collateral');
const instrumentRoutes = require('./routes/instruments');
const cardRoutes = require('./routes/cards');
const complianceRoutes = require('./routes/compliance');
const dashboardRoutes = require('./routes/dashboard');
const murabahaRoutes = require('./routes/murabaha');
const islamicRoutes = require('./routes/islamic');
const sharesRoutes = require('./routes/shares');
const savingsRoutes = require('./routes/savings');
const vacsRoutes = require('./routes/vacs');
const coreBankingRoutes = require('./routes/corebanking');
const cbsRoutes = require('./routes/cbs');
const mfbRoutes = require('./routes/mfb');
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
      return cb(new Error('Not allowed by CORS'));
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
      'auth', 'members', 'loans', 'shares', 'savings', 'vacs',
      'core-banking', 'cbs', 'mfb-prudential', 'chequebooks',
      'murabaha', 'islamic', 'collateral', 'cards', 'compliance', 'eod', 'cif', 'accounts', 'ledger',
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
app.use('/api/members', memberRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/collateral', collateralRoutes);
app.use('/api/instruments', instrumentRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/murabaha', murabahaRoutes);
app.use('/api/islamic', islamicRoutes);
app.use('/api/shares', sharesRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/vacs', vacsRoutes);
app.use('/api/core', coreBankingRoutes);
app.use('/api/cbs', cbsRoutes);
app.use('/api/mfb', mfbRoutes);
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
