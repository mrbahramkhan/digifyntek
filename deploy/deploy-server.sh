#!/usr/bin/env bash
# Forge — one-shot server deploy (app + optional HTTPS)
# Usage on a fresh Ubuntu server:
#   git clone <your-repo> && cd forge-coop
#   export JWT_SECRET=$(openssl rand -hex 32)
#   export DB_PASSWORD=$(openssl rand -hex 16)
#   export MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
#   sudo -E bash deploy/deploy-server.sh
#
# Optional HTTPS:
#   sudo DOMAIN=app.example.com EMAIL=you@example.com bash deploy/setup-https.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

if [[ -z "${JWT_SECRET:-}" || ${#JWT_SECRET} -lt 32 ]]; then
  red "Set JWT_SECRET (>=32 chars): export JWT_SECRET=\$(openssl rand -hex 32)"
  exit 1
fi
if [[ -z "${DB_PASSWORD:-}" ]]; then
  red "Set DB_PASSWORD: export DB_PASSWORD=\$(openssl rand -hex 16)"
  exit 1
fi
export MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-$DB_PASSWORD}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:4000}"

green "==> Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  yellow "Docker not found — installing (Ubuntu/Debian)..."
  if [[ "$(id -u)" -ne 0 ]]; then
    red "Need root to install Docker, or install Docker manually"
    exit 1
  fi
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! docker compose version >/dev/null 2>&1; then
  red "docker compose plugin required"
  exit 1
fi

green "==> Starting MySQL + Forge app"
docker compose up -d --build

green "==> Waiting for MySQL healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T mysql mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; then
    break
  fi
  sleep 2
done

green "==> DB init + admin user"
docker compose exec -T app sh -c "npm run db:init" || {
  yellow "db:init may need a moment — retrying once..."
  sleep 5
  docker compose exec -T app sh -c "npm run db:init"
}

ADMIN_PASS="${ADMIN_PASSWORD:-ChangeMeImmediately!}"
docker compose exec -T app sh -c "npm run db:seed-admin -- '$ADMIN_PASS'"

green "==> Health check"
sleep 2
curl -sf http://127.0.0.1:4000/health && echo "" || yellow "Health check soft-fail — check: docker compose logs app"

green "==> Deploy complete"
echo "  App:      http://SERVER_IP:4000"
echo "  Login:    superadmin / ${ADMIN_PASS}"
echo "  HTTPS:    sudo DOMAIN=your.domain EMAIL=you@email.com bash deploy/setup-https.sh"
echo ""
yellow "Change default admin password after first login."
