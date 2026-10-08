# Forge — Production guide

## Honest scope

This package hardens the **API + MySQL** path for pilot/production use:

- bcrypt-only login (no plain password bypass)
- Helmet, CORS allowlist, rate limits
- JWT with required strong secret in production
- Structured logging + audit_log on login/password change
- Health/ready probes, graceful shutdown
- Docker Compose (MySQL + API)

The **phase1 HTML UI remains a prototype shell**. For full production UX, ship Angular (or equivalent) against these APIs.

## Quick start (Docker)

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export DB_PASSWORD="$(openssl rand -hex 16)"
export MYSQL_ROOT_PASSWORD="$(openssl rand -hex 16)"
export CORS_ORIGINS="https://your-frontend.example"

docker compose up -d --build

# init schema (one-shot)
docker compose exec api sh -c "npm run db:init && npm run db:seed-admin -- 'YOUR_STRONG_PASSWORD'"
```

## Manual start

```bash
cd backend
cp .env.example .env
# edit JWT_SECRET, DB_*, CORS_ORIGINS
npm install
npm run db:init
npm run db:seed-admin -- 'YOUR_STRONG_PASSWORD'
NODE_ENV=production npm start
```

## Security checklist (must)

- [ ] `JWT_SECRET` ≥ 32 random characters
- [ ] Strong DB password; no default `forge_secret` in prod
- [ ] `npm run db:seed-admin` with non-default password
- [ ] `CORS_ORIGINS` = real frontend origins only
- [ ] TLS terminated at nginx/load balancer
- [ ] MySQL not exposed publicly
- [ ] Backups scheduled (daily dump)
- [ ] Change default superadmin password after first login
- [ ] Review role access before exposing write APIs widely

## API probes

- `GET /health` — liveness + DB ping
- `GET /ready` — readiness

## What is still not "bank-grade production"

- Full Angular SPA + CI/CD
- Automated penetration test
- SBP/Sharīʿah formal certification process
- Shares/savings full modules
- Multi-tenant isolation hardening beyond org_id
- WAF / advanced fraud monitoring

Treat go-live as **controlled pilot** after UAT on a staging copy of real processes.
