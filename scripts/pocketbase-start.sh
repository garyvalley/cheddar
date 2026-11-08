#!/bin/sh
# PocketBase's start in its image. With PB_SU_EMAIL and PB_SU_PASS set (the
# `pocketbase-superuser` Secret in the cluster, scripts/deploy-k8s.sh), it
# first makes that superuser or resets its password, so the account Nuxt uses
# to migrate the schema (scripts/migrate.mjs) is never set up by hand.
#
# The schema is not PocketBase's to apply: there is no migrations folder, and
# --automigrate=false stops a change in the admin UI from writing one.
set -eu
if [ -n "${PB_SU_EMAIL:-}" ] && [ -n "${PB_SU_PASS:-}" ]; then
  /pb/pocketbase superuser upsert "$PB_SU_EMAIL" "$PB_SU_PASS" --dir=/pb/pb_data
fi
exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --automigrate=false "$@"
