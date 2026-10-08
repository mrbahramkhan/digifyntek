# Zero-touch automation

## What is already automatic (in this project)

| Step | Automation |
|------|------------|
| Code | Git commits on `main` |
| One-command local run | `./start.sh` |
| Docker full stack | `deploy/deploy-server.sh` |
| HTTPS | `deploy/setup-https.sh` |
| Push → server | GitHub Actions `.github/workflows/deploy.yml` |

## What only YOU can enable (once)

Grok/automation **cannot** access your GitHub password, server SSH key, or domain DNS without you pasting them once.

### One-time (5 minutes) — then auto forever

1. Create empty GitHub repo  
2. Push:
   ```bash
   git remote add origin https://github.com/USER/REPO.git
   git push -u origin main
   ```
3. GitHub → Settings → Secrets → Actions — add:

| Secret | Example |
|--------|---------|
| `DEPLOY_HOST` | `1.2.3.4` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | private key contents |
| `DEPLOY_PATH` | `/home/ubuntu/forge-coop` |
| `REPO_URL` | `https://github.com/USER/REPO.git` |
| `JWT_SECRET` | long random string |
| `DB_PASSWORD` | strong password |
| `MYSQL_ROOT_PASSWORD` | strong password |
| `CORS_ORIGINS` | `https://app.yourdomain.com` |
| `ADMIN_PASSWORD` | strong admin password |

4. DNS A record for domain → server IP  
5. First time on server: install Docker, then optional:
   ```bash
   sudo DOMAIN=app.yourdomain.com EMAIL=you@email.com bash deploy/setup-https.sh
   ```

After that: **har `git push` auto-deploy** karega.

## Local (no GitHub)

```bash
./start.sh
```

Requires Docker or MySQL on the machine.
