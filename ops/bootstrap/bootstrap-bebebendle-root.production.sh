#!/usr/bin/env bash
# Bebebendle PRODUCTION host bootstrap — run once as root:
#   sudo bash /home/deploy/bootstrap-bebebendle-root.sh
#
# Creates /opt/bebebendle, PostgreSQL role+DB (bebebendle_production),
# and narrow NOPASSWD sudo for nginx reload for user deploy.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y unzip rsync curl git jq gettext-base

mkdir -p /opt/bebebendle/{releases,shared/uploads,shared/logs,shared/cache,shared/venvs,incoming,backups/daily}

if [[ -d /home/deploy/bebebendle ]]; then
  rsync -a /home/deploy/bebebendle/ /opt/bebebendle/
fi

chown -R deploy:deploy /opt/bebebendle
chmod 755 /opt/bebebendle
chmod 700 /opt/bebebendle/shared
if [[ -f /opt/bebebendle/shared/.env.example ]]; then
  chmod 600 /opt/bebebendle/shared/.env.example
fi
if [[ -f /opt/bebebendle/shared/.env ]]; then
  chmod 600 /opt/bebebendle/shared/.env
fi

# PostgreSQL role + production DB (idempotent). New password only if role is created.
PASS_FILE=/home/deploy/bebebendle-db-pass-once.txt
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='bebebendle'" | grep -qx 1; then
  DB_PASS=$(openssl rand -base64 32 | tr -d "/+=" | head -c 32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER bebebendle WITH PASSWORD '${DB_PASS}';"
  umask 077
  {
    echo "DATABASE_URL=postgresql://bebebendle:${DB_PASS}@127.0.0.1:5432/bebebendle_production"
    echo "Created: $(date -Is)"
  } > "$PASS_FILE"
  chown deploy:deploy "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  echo "Created DB role bebebendle; credentials written to $PASS_FILE (delete after copying into .env)"
else
  echo "DB role bebebendle already exists (password not rotated)"
  if [[ ! -f "$PASS_FILE" ]]; then
    echo "NOTE: role exists but $PASS_FILE is missing — set DATABASE_URL password manually if needed"
  fi
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='bebebendle_production'" | grep -qx 1; then
  sudo -u postgres createdb -O bebebendle bebebendle_production
  echo "Created database bebebendle_production"
else
  echo "Database bebebendle_production already exists"
fi

# Grant privileges if role existed before DB (idempotent)
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE bebebendle_production TO bebebendle;" >/dev/null

if [[ ! -f /etc/sudoers.d/bebebendle-deploy ]]; then
  cat > /etc/sudoers.d/bebebendle-deploy << 'SUDO'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl status nginx
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx
SUDO
  chmod 440 /etc/sudoers.d/bebebendle-deploy
  visudo -cf /etc/sudoers.d/bebebendle-deploy
  echo "Installed /etc/sudoers.d/bebebendle-deploy (nginx reload NOPASSWD)"
else
  echo "sudoers bebebendle-deploy already present"
fi

# Ensure certbot webroot exists (TLS later)
mkdir -p /var/www/certbot
chown root:www-data /var/www/certbot 2>/dev/null || true

echo "---"
echo "pm2 (system): $(command -v pm2 || echo missing)"
echo "bun (deploy): $(sudo -u deploy bash -lc 'command -v bun; bun -v' 2>/dev/null || echo missing)"
echo "uv  (deploy): $(sudo -u deploy bash -lc 'command -v uv; uv -V' 2>/dev/null || echo missing)"
echo "OK: /opt/bebebendle ready for production"
ls -la /opt/bebebendle
echo "---"
echo "Next:"
echo "  1. cp /opt/bebebendle/shared/.env.example /opt/bebebendle/shared/.env && chmod 600 ..."
echo "  2. Fill secrets; paste DATABASE_URL from $PASS_FILE if created"
echo "  3. rm -f $PASS_FILE"
echo "  4. Install nginx site + certbot for bebebendle.svagaplus.qzz.io"
echo "  5. GitHub Environment production + first deploy from main"
