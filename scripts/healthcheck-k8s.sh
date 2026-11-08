#!/usr/bin/env bash
#
# After scripts/deploy-k8s.sh: proves the public path end to end -- DNS,
# Cloudflare, the tunnel, nginx, Nuxt and PocketBase behind it.
#
# Usage: APP_HOST=<host> ./scripts/healthcheck-k8s.sh

set -uo pipefail

BASE_URL=https://${APP_HOST:?APP_HOST is required}
ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-40}"
SLEEP="${HEALTHCHECK_SLEEP:-3}"

for i in $(seq 1 "$ATTEMPTS"); do
  page=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$BASE_URL/login" 2>/dev/null || true)
  # Nuxt's own route, which asks PocketBase: {"me":null} when signed out.
  api=$(curl -s --max-time 5 "$BASE_URL/api/auth/me" 2>/dev/null || true)
  if [ "$page" = "200" ] && [ "$api" = '{"me":null}' ]; then
    echo "Healthy after $((i * SLEEP))s"
    exit 0
  fi
  echo "  waiting ($i/$ATTEMPTS) — page=$page api=${api:0:60}"
  sleep "$SLEEP"
done

echo "DEPLOY UNHEALTHY"
kubectl -n cheddar get pods -o wide 2>&1 | sed 's/^/  /'
kubectl -n cheddar get events --sort-by=.lastTimestamp 2>&1 | tail -20 | sed 's/^/  /'
for d in pocketbase nuxt nginx cloudflared; do
  echo "  ---- $d ----"
  kubectl -n cheddar logs "deployment/$d" --all-containers --tail=40 2>&1 | sed 's/^/    /'
done
exit 1
