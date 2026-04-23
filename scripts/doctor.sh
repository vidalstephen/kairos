#!/usr/bin/env bash
# doctor.sh — environment health check
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pass() { echo "  OK  $1"; }
fail() { echo " FAIL $1"; EXIT=1; }
EXIT=0

echo "== Toolchain =="
node -v >/dev/null 2>&1 && pass "node $(node -v)" || fail "node missing"
pnpm -v >/dev/null 2>&1 && pass "pnpm $(pnpm -v)" || fail "pnpm missing"
python3 --version >/dev/null 2>&1 && pass "$(python3 --version)" || fail "python3 missing"
uv --version >/dev/null 2>&1 && pass "$(uv --version)" || fail "uv missing"
docker --version >/dev/null 2>&1 && pass "$(docker --version)" || fail "docker missing"
docker compose version >/dev/null 2>&1 && pass "$(docker compose version | head -n1)" || fail "docker compose missing"

echo "== Repo =="
[ -f infra/compose/.env ] && pass "infra/compose/.env present" || fail "infra/compose/.env missing — run make bootstrap"
[ -f infra/compose/.dev/master.key ] && pass "dev master key present" || fail "dev master key missing"
docker network inspect proxy >/dev/null 2>&1 && pass "proxy network exists" || fail "proxy network missing"

echo "== Stack (if running) =="
docker compose -f infra/compose/docker-compose.yml ps --services --status running 2>/dev/null | while read -r s; do
  pass "$s running"
done

exit $EXIT
