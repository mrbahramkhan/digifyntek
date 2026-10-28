# CI and VPS deploy

## GitHub Actions

Workflow: `.github/workflows/ci.yml`

| Job | What |
|-----|------|
| unit-tests | `node --check` + `npm run test:unit` |
| integrity-tests | MySQL 8 service + schema apply + `npm run test:integrity` |

Runs on push/PR to `main`.

## VPS script

```bash
export APP_DIR=/opt/digifyntek
# first time: create backend/.env from .env.example
sudo -E bash scripts/deploy-vps.sh
# optional: APPLY_SQL=1 sudo -E bash scripts/deploy-vps.sh
```

Requires: Node 18+, MySQL client, optional pm2.

## Nginx sketch

```nginx
server {
  listen 443 ssl;
  server_name cbs.example.com;
  # ssl_certificate ...;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```
