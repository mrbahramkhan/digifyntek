/**
 * Ensure superadmin exists with bcrypt password (default 12345678 — change in production).
 * Usage: node scripts/seed-admin.js [password]
 */
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const password = process.argv[2] || process.env.ADMIN_PASSWORD || '12345678';
  if (password.length < 8) throw new Error('Password min 8 chars');
  const hash = await bcrypt.hash(password, 12);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'digifyntek',
    namedPlaceholders: true,
  });
  const [orgs] = await conn.query('SELECT id FROM organisations ORDER BY id LIMIT 1');
  if (!orgs.length) throw new Error('No organisation — run db:init first');
  const orgId = orgs[0].id;
  const [users] = await conn.query('SELECT id FROM users WHERE user_id = :u', { u: 'superadmin' });
  if (users.length) {
    await conn.query('UPDATE users SET password_hash = :h, is_active = 1 WHERE user_id = :u', {
      h: hash,
      u: 'superadmin',
    });
    console.log('Updated superadmin password hash');
  } else {
    await conn.query(
      `INSERT INTO users (org_id, user_id, password_hash, full_name, role)
       VALUES (:orgId, 'superadmin', :h, 'Super Admin', 'superadmin')`,
      { orgId, h: hash }
    );
    console.log('Created superadmin');
  }
  await conn.end();
  console.log('Login: superadmin / (your password)');
  if (password === '12345678') {
    console.warn('WARNING: default password in use — change immediately in production');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
