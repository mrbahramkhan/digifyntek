const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch (_) {}

function line(level, msg, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta || {}),
  };
  const s = JSON.stringify(entry);
  if (level === 'error') console.error(s);
  else console.log(s);
  try {
    fs.appendFileSync(path.join(logDir, 'forge.log'), s + '\n');
  } catch (_) {}
}

module.exports = {
  info: (msg, meta) => line('info', msg, meta),
  warn: (msg, meta) => line('warn', msg, meta),
  error: (msg, meta) => line('error', msg, meta),
};
