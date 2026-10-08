# Deploy: nginx + HTTPS

## Files

| File | Purpose |
|------|---------|
| `deploy-server.sh` | Docker up + DB init + admin seed |
| `setup-https.sh` | nginx + Let's Encrypt TLS |
| `nginx-https.conf` | Reference HTTPS config |
| `nginx-http-only.conf` | HTTP (ACME + proxy) before cert |

## 1. App deploy

```bash
git clone <YOUR_REPO_URL>
cd forge-coop   # or digital-kisaan-redesign

export JWT_SECRET=$(openssl rand -hex 32)
export DB_PASSWORD=$(openssl rand -hex 16)
export MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
export ADMIN_PASSWORD='YourStrongAdminPass!'

sudo -E bash deploy/deploy-server.sh
```

Open: `http://SERVER_IP:4000`

## 2. HTTPS (domain required)

DNS: `A` record → server public IP.

```bash
sudo DOMAIN=app.yourdomain.com EMAIL=admin@yourdomain.com bash deploy/setup-https.sh
```

Then set:

```bash
# in compose env / .env
CORS_ORIGINS=https://app.yourdomain.com
docker compose up -d
```

## 3. Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH
sudo ufw enable
# optional: close public 4000 after nginx is up
# sudo ufw deny 4000/tcp
```

## Renew

certbot timer auto-renews. Test:

```bash
sudo certbot renew --dry-run
```
