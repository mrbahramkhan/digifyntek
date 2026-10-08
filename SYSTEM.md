# Forge — Complete system map

## One process, full stack

```
Browser  →  Express (:4000)
              ├─ /api/*     JSON API (JWT)
              └─ /*         phase1 UI (static HTML)
                     ↓
                   MySQL 8
```

## Modules

| Module | UI | API |
|--------|-----|-----|
| Login / Dashboard | index.html | /api/auth, /api/dashboard |
| Members + 360 | members, member360 | /api/members |
| Shares | shares.html | /api/shares |
| Savings | savings.html | /api/savings |
| Cards | cards.html | /api/cards |
| Loans + PAR | loans.html | /api/loans |
| Murābaḥah | murabaha.html | /api/murabaha |
| Salam / Ijārah / Qard | islamic-ops.html | /api/islamic |
| Collateral | collateral.html | /api/collateral |
| Instruments | instruments.html | /api/instruments |
| Setup + registration | setup, registration | /api/compliance |

## Run (all-in-one)

```bash
cd backend && npm install
cp .env.example .env   # set JWT_SECRET, DB_*
npm run db:init && npm run db:seed-admin -- 'StrongPass!'
npm start
# open http://localhost:4000
```

## Docker

```bash
export JWT_SECRET=$(openssl rand -hex 32)
export DB_PASSWORD=$(openssl rand -hex 16)
docker compose up -d --build
docker compose exec app sh -c "npm run db:init && npm run db:seed-admin -- 'StrongPass!'"
# open http://localhost:4000
```

Login: **superadmin** / password from seed-admin.
