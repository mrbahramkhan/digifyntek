# DigiFyntek — Local deploy (Windows / Linux / Mac)

## Requirements

- Node.js 18+ (20 recommended)
- MySQL 8 **or** MariaDB 10.11+
- Git (optional)

## 1. Database

## Recommended: single schema install

```bash
mysql -u root -p < backend/sql/install-schema.sql
```

This creates database `digifyntek`, all CBS tables (CIF, accounts, ledger, financing, TD, KYC, teller, clearing, recon, payments sim, RBAC, cheque books), seed COA/products/teller, and user **superadmin** / **12345678**.

Prefer this over applying 01–09 scripts one-by-one.



```bash
mysql -u root -p -e "CREATE DATABASE digifyntek CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "
CREATE USER IF NOT EXISTS 'digi'@'localhost' IDENTIFIED BY 'change_me';
GRANT ALL ON digifyntek.* TO 'digi'@'localhost';
FLUSH PRIVILEGES;"

# Full dump (preferred)
mysql -u root -p digifyntek < db-exports/digifyntek_full.sql

# OR apply SQL scripts in order:
# backend/sql/01_schema.sql
# backend/sql/02_seed.sql
# backend/sql/05_chequebooks.sql
# backend/sql/06_cbs_core.sql
# backend/sql/07_mfb_prudential.sql
# backend/sql/08_eod.sql
# backend/sql/09_cbs_enterprise.sql
```

Default app login after dump:

- **User ID:** `superadmin`
- **Password:** `12345678`

## 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET (32+ chars)

npm install
npm run test:unit
npm start
```

Open: http://127.0.0.1:4000/app.html

Health: http://127.0.0.1:4000/health

## 3. Optional PM2

```bash
npm i -g pm2
cd backend
pm2 start src/server.js --name digifyntek
pm2 save
```

## 4. Optional Nginx

```nginx
server {
  listen 80;
  server_name cbs.local;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## Folder map

| Path | Purpose |
|------|---------|
| `backend/` | Node API + SQL |
| `backend/sql/` | Schema scripts |
| `phase1/` | UI (served by Express) |
| `db-exports/digifyntek_full.sql` | Ready MySQL dump |
| `scripts/deploy-vps.sh` | VPS helper |

## GitHub

https://github.com/mrbahramkhan/digifyntek
