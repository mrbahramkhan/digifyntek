/**
 * Run: node scripts/init-db.js
 * Applies schema + seed + murabaha + islamic migrations.
 * Re-runs: ignores duplicate column / table errors on 03/04.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function applyFile(conn, file) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', file), 'utf8');
  console.log('Applying', file);
  // Split on semicolons carefully for multi-statement
  try {
    await conn.query(sql);
  } catch (e) {
    const msg = e.message || '';
    const code = e.code || '';
    if (
      code === 'ER_DUP_FIELDNAME' ||
      code === 'ER_TABLE_EXISTS_ERROR' ||
      code === 'ER_DUP_KEYNAME' ||
      /Duplicate column/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      console.warn('  (ignored re-run error)', msg.split('\n')[0]);
      // try statement-by-statement
      const parts = sql.split(';').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        try {
          await conn.query(part);
        } catch (e2) {
          const m2 = e2.message || '';
          if (
            e2.code === 'ER_DUP_FIELDNAME' ||
            e2.code === 'ER_TABLE_EXISTS_ERROR' ||
            e2.code === 'ER_DUP_KEYNAME' ||
            /Duplicate column/i.test(m2) ||
            /already exists/i.test(m2)
          ) {
            /* ignore */
          } else if (!/Duplicate entry/i.test(m2)) {
            console.warn('  stmt warn:', m2.split('\n')[0]);
          }
        }
      }
    } else {
      throw e;
    }
  }
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  for (const file of ['01_schema.sql', '02_seed.sql', '03_murabaha.sql', '04_islamic_modes.sql']) {
    await applyFile(conn, file);
  }
  await conn.end();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
