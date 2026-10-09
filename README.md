# DigiFyntek

**Cooperative & fintech platform** for village agriculture cooperatives, credit societies, and member-owned financial institutions.

## Product

| | |
|--|--|
| **Name** | DigiFyntek |
| **Category** | Cooperative fintech |
| **Use** | VAC / credit cooperatives · members · shares · loans · Islamic modes · compliance |

## Quick start

```bash
./start.sh
# or
cd backend && npm install && npm run db:init && npm run db:seed-admin -- 'YourPass!' && npm start
```

Open **http://localhost:4000** · Login: `superadmin` / your seed password

## Docs

- [SYSTEM.md](SYSTEM.md) — modules  
- [PRODUCTION.md](PRODUCTION.md) — hardened deploy  
- [AUTO.md](AUTO.md) — CI / zero-touch  
- [deploy/README.md](deploy/README.md) — nginx + HTTPS  
- [BRAND.md](BRAND.md) — naming  

## Stack

Node.js · Express · MySQL 8 · UI served by API · Docker Compose


## GitHub Pages (UI demo)

Static UI: **https://mrbahramkhan.github.io/digifyntek/**

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main` (workflow `pages.yml` deploys `phase1/`)
3. Backend is **not** on Pages — set API URL in browser:
   ```js
   localStorage.setItem('DIGIFYNTEK_API_BASE', 'https://YOUR_API_HOST')
   ```
