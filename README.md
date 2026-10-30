# DigiFyntek

**Unified core banking / cooperative fintech application** — one workbench, form-first modules, SBP-oriented controls.

```
Login → Workbench → Customers · Accounts · Lending · Teller · Ledger · Members · Admin
```

| | |
|--|--|
| **Product** | DigiFyntek |
| **Stack** | Node.js · Express · MySQL / MariaDB |
| **UI** | Operational HTML workbench (`phase1/`) |
| **Repo** | https://github.com/mrbahramkhan/digifyntek |

## Modules (full application)

| Domain | Screens / APIs |
|--------|----------------|
| **Auth** | `login.html` · JWT · MFA (TOTP) for admin roles |
| **Customers** | CIF form · KYC cases · NADRA verify → auto-fill |
| **Accounts** | CASA open · cash in/out · TD · internal transfer |
| **Lending** | Products · disburse (conv. + Islamic) · portfolio · collateral |
| **Teller** | Drawer / vault · cheque books · clearing |
| **Ledger** | Double-entry journal · TB · recon · EOD + accrual |
| **Controls** | Maker-checker · payments sim · reports |
| **Members** | Register · 360 · shares · savings · cards |
| **Risk** | MFB prudential · compliance notes |
| **Admin** | Role assign · role manage · RBAC matrix · setup |

One home: **`app.html`**. No parallel product dashboards (old URLs redirect here).

## Quick start

```bash
git clone https://github.com/mrbahramkhan/digifyntek.git
cd digifyntek
./start.sh
```

Or manual:

```bash
cd backend
cp .env.example .env   # set DB_* and JWT_SECRET
npm install
mysql -u root -p < sql/install-schema.sql
# optional: sql/13_rbac_matrix_complete.sql  sql/14_mfa.sql
npm start
```

Open: **http://localhost:4000/login.html**

| User | Password |
|------|----------|
| `superadmin` | `12345678` |

> Change password and enable MFA in production. Default demo may set `MFA_ENFORCE_ADMIN=0`.

## Architecture

- **API:** `/api/*` and `/api/v1/*`
- **Ledger:** balanced journals, paisa-safe money helpers
- **RBAC:** `cbs_roles` · `cbs_permissions` · `requirePermission`
- **Product packs:** `PRODUCT_PACKS=conventional,islamic,agri` (optional filter)
- **NADRA:** simulator by default; live credentials via env

## Key docs

| File | Topic |
|------|--------|
| `SYSTEM.md` | How the system works |
| `docs-cbs/` | CBS / SBP / MFA / client deploy |
| `LOCAL_DEPLOY.md` | Local install |
| `PRODUCTION.md` | Production notes |
| `docker-compose.yml` | Optional containers |

## Health

`GET /health` → `{ ok, db, modules }`
