#!/usr/bin/env bash
# DigiFyntek VPS deploy helper (sample — review before production use)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/digifyntek}"
REPO="${REPO:-https://github.com/mrbahramkhan/digifyntek.git}"
BRANCH="${BRANCH:-main}"
NODE_ENV="${NODE_ENV:-production}"

echo "==> DigiFyntek deploy"
echo "    APP_DIR=$APP_DIR BRANCH=$BRANCH"

if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo git clone -b "$BRANCH" "$REPO" "$APP_DIR"
else
  cd "$APP_DIR"
  sudo git fetch origin
  sudo git checkout "$BRANCH"
  sudo git pull origin "$BRANCH"
fi

cd "$APP_DIR/backend"

if [ ! -f .env ]; then
  echo "ERROR: backend/.env missing. Create from .env.example with DB_* and JWT_SECRET."
  exit 1
fi

if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

# Optional schema apply (set APPLY_SQL=1)
if [ "${APPLY_SQL:-0}" = "1" ]; then
  echo "==> Applying SQL (APPLY_SQL=1)"
  # shellcheck disable=SC1091
  set -a; source .env; set +a
  for f in sql/01_schema.sql sql/06_cbs_core.sql sql/08_eod.sql sql/09_cbs_enterprise.sql; do
    [ -f "$f" ] || continue
    echo "    $f"
    mysql -h "${DB_HOST:-127.0.0.1}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "$f" || true
  done
fi

npm run test:unit || echo "WARN: unit tests failed"

if command -v pm2 >/dev/null 2>&1; then
  pm2 describe digifyntek >/dev/null 2>&1 && pm2 restart digifyntek || pm2 start src/server.js --name digifyntek
  pm2 save
else
  echo "pm2 not found — start manually: cd $APP_DIR/backend && npm start"
fi

echo "==> Done. Check: curl -s http://127.0.0.1:${PORT:-4000}/health"
