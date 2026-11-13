#!/usr/bin/env bash
#
# The restore drill (issue #22; k8s/README.md "Backups"): puts the backup on
# the NAS back into a scratch PocketBase on this machine, brings its schema up
# to date, and says what it holds, so a backup is known to restore before the
# day it has to.
#
#   scripts/restore-drill.sh [--at 2026-11-13T04:00:00Z]
#       Needs Docker, and in the environment the replica's settings as the
#       cluster has them (LITESTREAM_REPLICA_URL, and LITESTREAM_ENDPOINT,
#       LITESTREAM_ACCESS_KEY_ID, LITESTREAM_SECRET_ACCESS_KEY for S3), and
#       AGE_IDENTITY_FILE: the file holding the backup's private key. --at
#       restores the database as it was then (any time in the last 30 days).
#       IMAGE picks the PocketBase image (default: built from this checkout).
#
#   scripts/restore-drill.sh --self-test IMAGE
#       CI's check: in IMAGE, streams a new database to a replica in a temp
#       dir with a new key, checks the replica is encrypted, and restores it.
#
# The restored copy holds real financial data in plain text: it lives in a
# private temp dir that is deleted when the drill ends, and its PocketBase
# listens on loopback only, with no mail and no Plaid keys.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--self-test" ]; then
  image=${2:?usage: restore-drill.sh --self-test IMAGE}
  # shellcheck disable=SC2016 # expanded by the container's shell
  docker run --rm --entrypoint /bin/sh \
    -e LITESTREAM_REPLICA_URL=file:///tmp/replica \
    -v "$PWD/k8s/backup/litestream.yml:/etc/litestream/litestream.yml:ro" \
    "$image" -c '
      set -eu
      cd /tmp
      age-keygen -o key.txt 2>/dev/null
      LITESTREAM_AGE_RECIPIENT=$(age-keygen -y key.txt)
      export LITESTREAM_AGE_RECIPIENT
      /pb/pocketbase superuser upsert first@drill.test first-password-12345 --dir=/pb/pb_data >/dev/null
      litestream replicate -config /etc/litestream/litestream.yml > replicate.log 2>&1 &
      ls_pid=$!
      sleep 3
      # Written while Litestream runs, so it arrives through the WAL, not a snapshot.
      /pb/pocketbase superuser upsert second@drill.test second-password-12345 --dir=/pb/pb_data >/dev/null
      sleep 4
      kill "$ls_pid"; wait "$ls_pid" || true
      cat replicate.log
      [ -n "$(find /tmp/replica -type f)" ] || { echo "nothing reached the replica"; exit 1; }
      if grep -rq "drill.test" /tmp/replica; then echo "the replica holds plain text"; exit 1; fi
      mkdir -p /tmp/out
      LITESTREAM_AGE_IDENTITY=$(grep "^AGE-SECRET-KEY-" key.txt) \
        litestream restore -config /etc/litestream/litestream.yml -o /tmp/out/data.db /pb/pb_data/data.db
      if LITESTREAM_AGE_IDENTITY="" litestream restore -config /etc/litestream/litestream.yml -o /tmp/nokey.db /pb/pb_data/data.db 2>/dev/null; then
        echo "restored without the key"; exit 1
      fi
      /pb/pocketbase serve --dir=/tmp/out --hooksDir=/tmp/no-hooks --http=127.0.0.1:8099 > pb.log 2>&1 &
      for _ in $(seq 1 30); do curl -sf http://127.0.0.1:8099/api/health >/dev/null && break; sleep 1; done
      for who in first second; do
        curl -sf -X POST http://127.0.0.1:8099/api/collections/_superusers/auth-with-password \
          -H "content-type: application/json" \
          -d "{\"identity\":\"$who@drill.test\",\"password\":\"$who-password-12345\"}" >/dev/null \
          || { echo "the restored copy is missing $who@drill.test"; cat pb.log; exit 1; }
      done
      echo "restore drill (self-test): encrypted, restored, and both writes are there"
    '
  exit 0
fi

at=""
if [ "${1:-}" = "--at" ]; then at=${2:?--at needs a time, e.g. 2026-11-13T04:00:00Z}; fi
: "${LITESTREAM_REPLICA_URL:?LITESTREAM_REPLICA_URL is required (the replica, as in the cluster)}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required (the file holding the backup key)}"
LITESTREAM_AGE_IDENTITY=$(grep '^AGE-SECRET-KEY-' "$AGE_IDENTITY_FILE" | head -1)
[ -n "$LITESTREAM_AGE_IDENTITY" ] || { echo "No AGE-SECRET-KEY-... line in $AGE_IDENTITY_FILE" >&2; exit 1; }
export LITESTREAM_AGE_IDENTITY LITESTREAM_REPLICA_URL
export LITESTREAM_ENDPOINT=${LITESTREAM_ENDPOINT:-}
export LITESTREAM_ACCESS_KEY_ID=${LITESTREAM_ACCESS_KEY_ID:-}
export LITESTREAM_SECRET_ACCESS_KEY=${LITESTREAM_SECRET_ACCESS_KEY:-}
image=${IMAGE:-}
if [ -z "$image" ]; then
  image=cheddar-pb:drill
  echo "Building the PocketBase image..."
  docker build -q -f Dockerfile.pocketbase -t "$image" . >/dev/null
fi
LITESTREAM_AGE_RECIPIENT=$(printf '%s\n' "$LITESTREAM_AGE_IDENTITY" | docker run --rm -i --entrypoint age-keygen "$image" -y)
export LITESTREAM_AGE_RECIPIENT

# Private to this user; the containers run as this user too, so the copy is
# never readable by anyone else on this machine.
umask 077
tmp=$(mktemp -d)
name=cheddar-restore-drill-$$
as_me=(--user "$(id -u):$(id -g)")
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

echo "Restoring${at:+ as of $at}..."
docker run --rm "${as_me[@]}" \
  -e LITESTREAM_REPLICA_URL -e LITESTREAM_ENDPOINT -e LITESTREAM_ACCESS_KEY_ID -e LITESTREAM_SECRET_ACCESS_KEY \
  -e LITESTREAM_AGE_IDENTITY -e LITESTREAM_AGE_RECIPIENT \
  -v "$PWD/k8s/backup/litestream.yml:/etc/litestream/litestream.yml:ro" -v "$tmp:/out" \
  "$image" litestream restore -config /etc/litestream/litestream.yml ${at:+-timestamp "$at"} -o /out/data.db /pb/pb_data/data.db

PB_SU_EMAIL=drill@cheddar.internal
PB_SU_PASS=$(openssl rand -hex 24)
export PB_SU_EMAIL PB_SU_PASS
port=${DRILL_PORT:-8096}
docker run -d --name "$name" "${as_me[@]}" -p "127.0.0.1:$port:8090" -e PB_SU_EMAIL -e PB_SU_PASS -e APP_URL=http://localhost \
  -v "$tmp:/pb/pb_data" "$image" >/dev/null
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$port/api/health" >/dev/null && break; sleep 1; done

echo "Bringing the schema up to date..."
PB_URL="http://127.0.0.1:$port" node scripts/migrate.mjs

token=$(curl -sf -X POST "http://127.0.0.1:$port/api/collections/_superusers/auth-with-password" \
  -H 'content-type: application/json' -d "{\"identity\":\"$PB_SU_EMAIL\",\"password\":\"$PB_SU_PASS\"}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).token))')
echo "The restored copy holds:"
for c in users accounts transactions balance_history bank_links; do
  n=$(curl -sf -H "authorization: $token" "http://127.0.0.1:$port/api/collections/$c/records?perPage=1&skipTotal=0" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).totalItems))')
  printf '  %-16s %s\n' "$c" "$n"
done
newest=$(curl -sf -H "authorization: $token" "http://127.0.0.1:$port/api/collections/transactions/records?perPage=1&sort=-created&skipTotal=1" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).items[0]?.created||"none"))')
echo "  newest transaction saved $newest"
echo "Restore drill passed. The copy is deleted now."
