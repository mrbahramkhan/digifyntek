const logger = require('../services/logger');
const env = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.path });
}

function errorHandler(err, req, res, next) {
  logger.error(err.message || 'Unhandled', {
    stack: env.isProd ? undefined : err.stack,
    path: req.path,
    method: req.method,
    userId: req.user && req.user.userId,
  });
  const status = err.status || err.statusCode || 500;
  const body = {
    error: status >= 500 && env.isProd ? 'Internal server error' : err.message || 'Error',
  };
  if (!env.isProd && err.stack) body.stack = err.stack;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
