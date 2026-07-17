#!/usr/bin/env bash
# Install Bebebendle production nginx site + Let's Encrypt cert.
# Run on production host as root:
#   sudo bash /home/deploy/install-bebebendle-nginx.sh
#   sudo CERTBOT_EMAIL=you@example.com bash /home/deploy/install-bebebendle-nginx.sh
#
# Prerequisites:
#   - DNS A for bebebendle.svagaplus.qzz.io → this host (185.184.123.237)
#     If Cloudflare: set A to origin IP. For certbot HTTP-01 either
#     grey-cloud (DNS only) or ensure CF proxies ACME /.well-known/
#   - Files under /home/deploy/nginx-bebebendle/ (uploaded by provision)
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

DOMAIN="bebebendle.svagaplus.qzz.io"
SRC_DIR="/home/deploy/nginx-bebebendle"
HTTP_BOOT="${SRC_DIR}/bebebendle.http-bootstrap.conf"
FULL_CONF="${SRC_DIR}/bebebendle.svagaplus.qzz.io.conf"
SITE_AVAIL="/etc/nginx/sites-available/${DOMAIN}.conf"
SITE_EN="/etc/nginx/sites-enabled/${DOMAIN}.conf"
CERT_LIVE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
EMAIL="${CERTBOT_EMAIL:-}"

if [[ ! -f "$HTTP_BOOT" || ! -f "$FULL_CONF" ]]; then
  echo "Missing conf files in $SRC_DIR" >&2
  ls -la "$SRC_DIR" 2>/dev/null || true
  exit 1
fi

mkdir -p /var/www/certbot
chown root:www-data /var/www/certbot 2>/dev/null || true
chmod 755 /var/www/certbot

if [[ -f "$CERT_LIVE" ]]; then
  echo "==> Cert already exists — installing full HTTPS config"
  cp "$FULL_CONF" "$SITE_AVAIL"
else
  echo "==> No cert yet — installing HTTP bootstrap"
  cp "$HTTP_BOOT" "$SITE_AVAIL"
fi

ln -sfn "$SITE_AVAIL" "$SITE_EN"
nginx -t
systemctl reload nginx
echo "nginx reloaded with $SITE_AVAIL"

if [[ ! -f "$CERT_LIVE" ]]; then
  if ! command -v certbot >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y certbot python3-certbot-nginx
  fi

  if [[ -z "$EMAIL" ]]; then
    # try reuse email from another renewal config
    EMAIL=$(grep -h '^email' /etc/letsencrypt/renewal/*.conf 2>/dev/null | head -1 | awk '{print $3}' || true)
  fi
  if [[ -z "$EMAIL" ]]; then
    echo ""
    echo "Set CERTBOT_EMAIL and re-run, e.g.:"
    echo "  sudo CERTBOT_EMAIL=you@example.com bash $0"
    echo "HTTP bootstrap is already live. After DNS points here, re-run for cert."
    exit 0
  fi

  echo "==> Requesting certificate for $DOMAIN (email=$EMAIL)"
  certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos --no-eff-email --non-interactive

  echo "==> Switching to full HTTPS config"
  cp "$FULL_CONF" "$SITE_AVAIL"
  nginx -t
  systemctl reload nginx
fi

echo "OK: https://$DOMAIN (proxy → 127.0.0.1:3000, /api/internal → 404)"
echo "Cloudflare SSL mode: Full (strict) once this cert is on the origin."
ls -la "$SITE_AVAIL" "$SITE_EN"
ls -la "/etc/letsencrypt/live/${DOMAIN}/" 2>/dev/null || true
