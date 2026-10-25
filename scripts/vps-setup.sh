#!/usr/bin/env bash
# One-command Citeloop install for a fresh Ubuntu/Debian VPS:
# Docker + the app + Caddy (automatic HTTPS) on your domain.
# Usage (as root):  bash <(curl -fsSL https://raw.githubusercontent.com/sachin-jangir8290/Seotool/main/scripts/vps-setup.sh)
set -euo pipefail

REPO="${REPO:-https://github.com/sachin-jangir8290/Seotool.git}"
DIR="${DIR:-/opt/citeloop}"
ask() { local v; read -r -p "$1" v </dev/tty; echo "$v"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root (or prefix with sudo)."; exit 1; }

DOMAIN="$(ask 'Domain for Citeloop (e.g. citeloop.openwise.tech): ')"
[ -n "$DOMAIN" ] || { echo "A domain is required."; exit 1; }
KEY="$(ask 'Anthropic API key (optional, press Enter to skip): ')"

echo "==> Checking that $DOMAIN points to this server"
MYIP="$(curl -fsS https://api.ipify.org || true)"
DNSIP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -n "$MYIP" ] && [ "$MYIP" != "$DNSIP" ]; then
  echo "    Warning: $DOMAIN resolves to '${DNSIP:-nothing}', this server is $MYIP."
  echo "    Add an A record: name '${DOMAIN%%.*}' -> $MYIP. HTTPS will start working once it points here."
fi

echo "==> Installing Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "==> Getting Citeloop"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else
  command -v git >/dev/null || (apt-get update -y && apt-get install -y git)
  git clone "$REPO" "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" .env
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  [ -n "$KEY" ] && sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$KEY|" .env
  chmod 600 .env
else
  echo "    Keeping your existing .env"
fi

echo "==> Starting Citeloop"
docker compose up -d --build
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1 && break; sleep 2; done
curl -fsS http://127.0.0.1:3000/healthz >/dev/null || { echo "App did not start. See: docker compose logs"; exit 1; }

if ss -ltnp 2>/dev/null | grep -E ':(80|443) ' | grep -vq caddy; then
  echo "==> Ports 80/443 are already used by another web server (nginx/Apache?)."
  echo "    Citeloop is running on 127.0.0.1:3000 — add a reverse proxy for $DOMAIN to it in that server."
  exit 0
fi

echo "==> Installing Caddy (HTTPS)"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
printf '%s {\n  reverse_proxy 127.0.0.1:3000\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy
command -v ufw >/dev/null && ufw status | grep -q active && { ufw allow 80; ufw allow 443; } || true

echo
echo "Done! Open https://$DOMAIN"
echo "Create your account at https://$DOMAIN/dashboard.html, then close sign-up with:"
echo "  cd $DIR && echo ALLOW_SIGNUP=false >> .env && docker compose up -d"
