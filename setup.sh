#!/usr/bin/env bash
# One-paste HAX/VPS setup. Run from an empty dir:
#   bash setup.sh https://github.com/YOUR_USER/YOUR_REPO.git
set -e
REPO="${1:?Usage: bash setup.sh <github-repo-url>}"

echo "[1/4] Installing Node.js 20 + git + pm2..."
apt-get update -y >/dev/null 2>&1 || sudo apt-get update -y >/dev/null 2>&1
apt-get install -y git curl >/dev/null 2>&1 || sudo apt-get install -y git curl >/dev/null 2>&1
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | (sudo -E bash 2>/dev/null || bash)
  apt-get install -y nodejs >/dev/null 2>&1 || sudo apt-get install -y nodejs >/dev/null 2>&1
fi
npm install -g pm2 >/dev/null 2>&1 || sudo npm install -g pm2 >/dev/null 2>&1
echo "node $(node -v), pm2 $(pm2 -v)"

echo "[2/4] Cloning bot..."
rm -rf appy-forum-bot
git clone "$REPO" appy-forum-bot
cd appy-forum-bot

echo "[3/4] Installing deps..."
npm ci --omit=dev
if [ ! -f .env ]; then
  cp .env.example .env
  echo "!! Edit .env now with your Discord token, then RE-RUN this script:"
  echo "   nano .env"
fi

if grep -q "put-your" .env; then
  echo "!! .env still has placeholder values. Fill DISCORD_TOKEN, then re-run."
  exit 1
fi

echo "[4/4] Starting bot with pm2..."
pm2 delete appy-forum 2>/dev/null || true
pm2 start src/index.js --name appy-forum
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save
echo "--- done. logs: pm2 logs appy-forum ---"
