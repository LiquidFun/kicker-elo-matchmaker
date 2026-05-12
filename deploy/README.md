# Deployment

Single Linux VM, systemd-managed uvicorn behind nginx, SQLite on disk, deployed via GitHub Actions over SSH.

## One-time server setup

Run as root on the target server.

```bash
# System packages
apt update
apt install -y nginx sqlite3 rsync python3-pip python3-venv
curl -LsSf https://astral.sh/uv/install.sh | sh   # uv in /root/.local/bin
ln -sf /root/.local/bin/uv /usr/local/bin/uv

# Dedicated user
useradd --system --create-home --home-dir /opt/kicker --shell /usr/sbin/nologin kicker

# Directory layout
install -d -o kicker -g kicker /opt/kicker/backend /opt/kicker/frontend/dist /opt/kicker/backups /opt/kicker/deploy

# Initial app code (will be overwritten by CI later)
sudo -u kicker bash -c 'cd /opt/kicker && git clone https://github.com/<you>/KickerEloApp.git src'
sudo -u kicker bash -c 'cd /opt/kicker/src/backend && uv sync'

# Backend env file — KEEP SECRET
cat > /opt/kicker/backend/.env <<EOF
KICKER_DATABASE_URL=sqlite:////opt/kicker/backend/kicker.db
KICKER_SECRET_KEY=$(openssl rand -hex 32)
KICKER_PUBLIC_BASE_URL=https://<your-domain>
KICKER_CORS_ORIGINS=["https://<your-domain>"]
KICKER_COOKIE_SECURE=true
EOF
chown kicker:kicker /opt/kicker/backend/.env
chmod 600 /opt/kicker/backend/.env

# Bootstrap an initial admin user
sudo -u kicker bash -c 'cd /opt/kicker/backend && uv run python -m kicker.bootstrap admin "Admin" <strong-password>'

# systemd unit
cp deploy/systemd/kicker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kicker

# Allow the kicker user to restart its own service (used by the deploy workflow)
cat > /etc/sudoers.d/kicker <<'EOF'
kicker ALL=(ALL) NOPASSWD: /bin/systemctl restart kicker
EOF
chmod 440 /etc/sudoers.d/kicker

# nginx + TLS
cp deploy/nginx/kicker.conf /etc/nginx/sites-available/kicker
sed -i 's|<domain>|your-domain.example|g' /etc/nginx/sites-available/kicker
ln -sf /etc/nginx/sites-available/kicker /etc/nginx/sites-enabled/kicker
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.example

# Nightly SQLite backup
crontab -u kicker -l 2>/dev/null > /tmp/cron.tmp || true
echo '0 4 * * * /opt/kicker/deploy/scripts/backup-sqlite.sh' >> /tmp/cron.tmp
crontab -u kicker /tmp/cron.tmp
rm /tmp/cron.tmp
```

## GitHub Actions secrets

Set these on the repo (Settings → Secrets and variables → Actions):

| Secret | What it is |
|---|---|
| `DEPLOY_HOST` | Server hostname or IP (e.g. `kicker.example.com`) |
| `DEPLOY_USER` | The deploy user — typically `kicker` |
| `DEPLOY_SSH_KEY` | Private SSH key (ed25519). Public half goes in `/opt/kicker/.ssh/authorized_keys`. |

Then create an environment called `production` (Settings → Environments) and attach those secrets to it if you want manual approvals.

## What the deploy does

1. Builds the React app on the runner.
2. Rsyncs `backend/`, `frontend/dist/`, and `deploy/` to `/opt/kicker/...` on the server.
3. SSHes in, runs `uv sync`, then restarts the `kicker` systemd unit.

nginx is unchanged by deploys — it just serves the new files in place.

## Restoring from backup

```bash
sudo systemctl stop kicker
sudo -u kicker cp /opt/kicker/backups/kicker-<timestamp>.db.gz /tmp/
gunzip /tmp/kicker-<timestamp>.db.gz
sudo -u kicker mv /tmp/kicker-<timestamp>.db /opt/kicker/backend/kicker.db
sudo systemctl start kicker
```
