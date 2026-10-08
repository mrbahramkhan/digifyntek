#!/usr/bin/env bash
# Forge — nginx + Let's Encrypt HTTPS setup
# Usage:
#   sudo DOMAIN=app.example.com EMAIL=you@example.com bash deploy/setup-https.sh
#
# Prerequisites:
#   - Ubuntu/Debian server
#   - DNS A record: DOMAIN → this server public IP
#   - Forge app already running on 127.0.0.1:4000 (docker compose or npm start)
#   - Ports 80 and 443 open

set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
APP_PORT="${APP_PORT:-4000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  red "Run as root: sudo DOMAIN=... EMAIL=... bash deploy/setup-https.sh"
  exit 1
fi

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  red "Required env: DOMAIN and EMAIL"
  echo "Example: sudo DOMAIN=app.example.com EMAIL=admin@example.com bash deploy/setup-https.sh"
  exit 1
fi

if [[ "$DOMAIN" == "app.example.com" ]]; then
  yellow "Warning: DOMAIN is still app.example.com — replace with your real domain."
fi

green "==> Installing nginx + certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx curl

mkdir -p /var/www/certbot

green "==> Writing HTTP nginx config (for ACME + proxy)"
sed "s/app.example.com/${DOMAIN}/g" "$SCRIPT_DIR/nginx-http-only.conf" \
  > /etc/nginx/sites-available/digifyntek
ln -sfn /etc/nginx/sites-available/digifyntek /etc/nginx/sites-enabled/digifyntek
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx

green "==> Checking app on 127.0.0.1:${APP_PORT}"
if ! curl -sf "http://127.0.0.1:${APP_PORT}/health" >/dev/null; then
  yellow "App health check failed on :${APP_PORT}"
  yellow "Start Forge first, e.g.:"
  yellow "  cd $REPO_ROOT && docker compose up -d"
  yellow "Then re-run this script."
  exit 1
fi
green "App is up."

green "==> Requesting Let's Encrypt certificate for ${DOMAIN}"
certbot --nginx \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --redirect \
  --keep-until-expiring

# Optional: merge extra security headers from our template if certbot left a basic server block
# Certbot usually modifies the same file in place — good enough.

nginx -t
systemctl reload nginx

green "==> Enabling certbot renew timer"
systemctl enable certbot.timer 2>/dev/null || true
systemctl start certbot.timer 2>/dev/null || true

# Dry-run renew (non-fatal)
certbot renew --dry-run 2>/dev/null || yellow "Renew dry-run skipped/failed (check later)"

green "==> Done"
echo ""
echo "  HTTPS:  https://${DOMAIN}"
echo "  Health: https://${DOMAIN}/health"
echo ""
echo "Set backend CORS / public URL:"
echo "  CORS_ORIGINS=https://${DOMAIN}"
echo "  (restart app after updating env)"
echo ""
echo "Renewal is automatic via certbot.timer"
