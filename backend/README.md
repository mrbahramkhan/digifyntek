# Forge Backend (production-hardened)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run db:init` | Schema + seed + migrations |
| `npm run db:seed-admin` | bcrypt hash for superadmin |
| `npm start` | Production mode |
| `npm run dev` | Development watch |
| `npm run healthcheck` | Local /health |

## Auth

- Login: `POST /api/auth/login` `{ "userId", "password" }`
- Me: `GET /api/auth/me`
- Change password: `POST /api/auth/change-password`
- **No plain-text password bypass**

See root `PRODUCTION.md`.
