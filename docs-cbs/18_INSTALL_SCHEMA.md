# install-schema.sql

Single-file MySQL/MariaDB install for DigiFyntek CBS (UAT-aligned).

## Install

```bash
mysql -u root -p < backend/sql/install-schema.sql
```

Creates:

- Database `digifyntek`
- CBS tables: customers, accounts, ledger, financing, TD, approvals, KYC, payments (sim), teller, clearing, recon, EOD, RBAC, cheque books
- Seed: COA, products, branch 001, vault, teller T001, roles/permissions
- User: `superadmin` / `12345678` (change in production)

## After install

```bash
cd backend
cp .env.example .env   # DB_NAME=digifyntek, DB_USER, DB_PASSWORD, JWT_SECRET
npm install
npm start
```

Open http://127.0.0.1:4000/app.html
