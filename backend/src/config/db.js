const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.isProd ? 20 : 10,
  namedPlaceholders: true,
  enableKeepAlive: true,
  timezone: 'Z',
});

async function ping() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

module.exports = pool;
module.exports.ping = ping;
