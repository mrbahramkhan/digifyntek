# Forge

**Cooperative & fintech platform** for village agriculture cooperatives, credit societies, and member-owned financial institutions.

Not “Digital Kisaan” — product name is **Forge**.

## What it is

- Member CRM (optional Farmer tag)
- Share capital & savings
- Loans with PAR / MCL
- Islamic modes: Murābaḥah, Salam, Ijārah, Qard Ḥasan
- Collateral, instruments, membership cards
- Cooperative compliance & Pakistan registration checklist

## Quick start

```bash
./start.sh
# or
cd backend && npm install && npm run db:init && npm run db:seed-admin -- 'YourPass!' && npm start
```

Open **http://localhost:4000** · Login: `superadmin` / your seed password

## Docs

| Doc | Topic |
|-----|--------|
| [SYSTEM.md](SYSTEM.md) | Full module map |
| [PRODUCTION.md](PRODUCTION.md) | Hardened deploy |
| [AUTO.md](AUTO.md) | Zero-touch / CI |
| [deploy/README.md](deploy/README.md) | nginx + HTTPS |
| [GIT_DEPLOY.md](GIT_DEPLOY.md) | Git push |

## Stack

Node.js · Express · MySQL 8 · phase1 UI (served by API) · Docker Compose

Legacy origin: redesigned from an older “Digital Kisaan” app; this codebase is **Forge**.
