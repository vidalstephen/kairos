#!/usr/bin/env bash
# setup.sh — one-time bootstrap for local development
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking toolchain"
command -v node >/dev/null || { echo "node not found"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not found — install with: npm i -g pnpm"; exit 1; }
command -v python3 >/dev/null || { echo "python3 not found"; exit 1; }
command -v uv >/dev/null || { echo "uv not found — install: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
command -v docker >/dev/null || { echo "docker not found"; exit 1; }

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "node 20+ required (have $(node -v))"; exit 1
fi

echo "==> Installing JS deps"
pnpm install

echo "==> Installing Python deps (cognition)"
(cd services/cognition && uv sync)

echo "==> Generating dev master key for vault if absent"
mkdir -p infra/compose/.dev
if [ ! -f infra/compose/.dev/master.key ]; then
  # age generates its own; for dev we just make a random secret file
  head -c 32 /dev/urandom | base64 > infra/compose/.dev/master.key
  chmod 600 infra/compose/.dev/master.key
fi

echo "==> Copying .env.example to infra/compose/.env if absent"
[ -f infra/compose/.env ] || cp infra/compose/.env.example infra/compose/.env

echo "==> Creating proxy network if absent"
docker network inspect proxy >/dev/null 2>&1 || docker network create proxy

echo "==> Setup complete. Next: make up"
