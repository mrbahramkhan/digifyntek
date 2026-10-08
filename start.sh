#!/usr/bin/env bash
# Forge — zero-config local start (does everything automatically)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

log() { printf '\n\033[32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mWARN:\033[0m %s\n' "$*"; }

# Secrets (auto-generate if missing)
if [[ ! -f backend/.env ]]; then
  log "Creating backend/.env with generated secrets"
  JWT=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
  DBP=$(openssl rand -hex 12 2>/dev/null || echo "forge_local_pass")
  cat > backend/.env << ENV
NODE_ENV=development
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=forge_coop
JWT_SECRET=$JWT
JWT_EXPIRES=8h
CORS_ORIGINS=http://localhost:4000,http://127.0.0.1:4000,http://localhost:8080
TRUST_PROXY=0
ENV
fi

log "Installing backend dependencies"
cd backend
npm install --no-audit --no-fund

# MySQL: try docker, else local mysql, else SQLite message
start_mysql() {
  if command -v docker >/dev/null 2>&1; then
    log "Starting MySQL via Docker"
    docker rm -f forge-mysql 2>/dev/null || true
    docker run -d --name forge-mysql \
      -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
      -e MYSQL_DATABASE=forge_coop \
      -p 3306:3306 \
      mysql:8.0
    log "Waiting for MySQL..."
    for i in $(seq 1 40); do
      if docker exec forge-mysql mysqladmin ping -h 127.0.0.1 --silent 2>/dev/null; then
        return 0
      fi
      sleep 2
    done
    warn "MySQL container not ready in time"
    return 1
  fi
  if command -v mysql >/dev/null 2>&1; then
    log "Using local mysql client"
    mysql -u root -e "CREATE DATABASE IF NOT EXISTS forge_coop;" 2>/dev/null || true
    return 0
  fi
  return 1
}

if start_mysql; then
  log "Initializing database"
  npm run db:init || true
  log "Seeding admin (superadmin / ForgeAdmin123!)"
  npm run db:seed-admin -- 'ForgeAdmin123!' || true
else
  warn "MySQL not available in this environment."
  warn "Install Docker or MySQL, then re-run: ./start.sh"
fi

log "Starting Forge on http://127.0.0.1:4000"
echo "Login: superadmin / ForgeAdmin123!"
echo "Press Ctrl+C to stop"
exec node src/server.js
