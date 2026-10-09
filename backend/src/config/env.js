require('dotenv').config();

function required(name, minLen = 1) {
  const v = process.env[name];
  if (!v || String(v).length < minLen) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing/invalid env: ${name}`);
    }
  }
  return v;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || '') === 'production',
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'digifyntek',
  },
  jwtSecret: process.env.JWT_SECRET || 'forge-dev-secret-ONLY-for-local',
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 200),
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  trustProxy: process.env.TRUST_PROXY === '1',
};

if (env.isProd) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set and >= 32 characters in production');
  }
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD must be set in production');
  }
  if (env.corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS must not be * in production');
  }
}

module.exports = env;
