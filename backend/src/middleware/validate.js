function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => {
      const v = req.body && req.body[f];
      return v === undefined || v === null || v === '';
    });
    if (missing.length) {
      return res.status(400).json({ error: 'Missing fields', fields: missing });
    }
    next();
  };
}

function sanitizeString(s, max = 500) {
  if (s == null) return s;
  return String(s).trim().slice(0, max);
}

module.exports = { requireFields, sanitizeString };
