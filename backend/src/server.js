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
  try {
    const dbOk = await ping();
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      service: 'digifyntek-api',
      env: env.nodeEnv,
      ts: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ ok: false, error: 'db_unavailable' });
  }
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
