const pool = require('../config/db');
const logger = require('../services/logger');

async function writeAudit(userId, action, entity, entityId, detail) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, detail_json)
       VALUES (:userId, :action, :entity, :entityId, :detail)`,
      {
        userId: userId || null,
        action,
        entity: entity || null,
        entityId: entityId != null ? String(entityId) : null,
        detail: detail ? JSON.stringify(detail) : null,
      }
    );
  } catch (e) {
    logger.warn('audit write failed', { error: e.message });
  }
}

function auditMiddleware(action, entity) {
  return (req, res, next) => {
    const end = res.end;
    res.end = function (...args) {
      if (res.statusCode < 400 && req.user) {
        writeAudit(req.user.id, action, entity, req.params.id || null, {
          method: req.method,
          path: req.path,
        });
      }
      end.apply(res, args);
    };
    next();
  };
}

module.exports = { writeAudit, auditMiddleware };
