#!/usr/bin/env bash
#
# Deploys Cheddar to the k3s cluster. CI's `deploy` job runs this on the
# self-hosted runner on `primary`, whose kubectl acts as the `deployer`
# service account, allowed in the `cheddar` namespace and nowhere else
# (k8s/cluster/cheddar.yaml).
#
# Every value comes from the job's environment -- the repository's secrets
# and variables -- and is written into Kubernetes Secrets here. Secret values
# go through files in a private temp dir, never on a command line, where
# other users on primary could read them in `ps`.

set -euo pipefail

: "${APP_HOST:?APP_HOST is required (repository variable CLUSTER_HOST)}"
: "${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
: "${NUXT_TAG:?NUXT_TAG is required}"
: "${PB_TAG:?PB_TAG is required}"
: "${GHCR_USER:?GHCR_USER is required}"
: "${GHCR_TOKEN:?GHCR_TOKEN is required}"
: "${CLOUDFLARE_TUNNEL_TOKEN:?CLOUDFLARE_TUNNEL_TOKEN is required}"

NS=cheddar
cd "$(dirname "$0")/.."

umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

apply_secret() { # name, then kubectl create secret arguments
  local name=$1; shift
  kubectl -n "$NS" create secret generic "$name" "$@" --dry-run=client -o yaml | kubectl apply -f -
}

# Image pulls, with the job's GITHUB_TOKEN, which GitHub revokes when the job ends.
auth=$(printf '%s:%s' "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\n')
printf '{"auths":{"ghcr.io":{"auth":"%s"}}}' "$auth" > "$tmp/dockerconfig.json"
apply_secret ghcr --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson="$tmp/dockerconfig.json"

# PocketBase's environment. Without Mailjet's keys it sends no mail at all.
{
  echo "MAILJET_API_KEY=${MAILJET_API_KEY:-}"
  echo "MAILJET_SECRET_KEY=${MAILJET_SECRET_KEY:-}"
  echo "MAILJET_SENDER_EMAIL=${MAILJET_SENDER_EMAIL:-}"
  echo "MAILJET_SENDER_NAME=${MAILJET_SENDER_NAME:-Cheddar}"
} > "$tmp/pocketbase.env"
apply_secret pocketbase-env --from-env-file="$tmp/pocketbase.env"

# Whoever holds the tunnel token can serve APP_HOST from their own machine.
echo "TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN" > "$tmp/cloudflared.env"
apply_secret cloudflared --from-env-file="$tmp/cloudflared.env"

# The superuser the web pod's init container migrates the schema with. Made
# on the first deploy and then left alone; k8s/README.md says how to rotate it.
if ! kubectl -n "$NS" get secret pocketbase-superuser >/dev/null 2>&1; then
  {
    echo "PB_SU_EMAIL=nuxt@cheddar.internal"
    echo "PB_SU_PASS=$(openssl rand -hex 32)"
  } > "$tmp/pocketbase-superuser.env"
  kubectl -n "$NS" create secret generic pocketbase-superuser --from-env-file="$tmp/pocketbase-superuser.env"
fi

# Each pod template carries a checksum of the settings it reads, so a changed
# secret rolls the pods that read it, and nothing else.
checksum() { sha256sum | cut -c1-16; }
PB_CONFIG=$(checksum < "$tmp/pocketbase.env")
CLOUDFLARED_CONFIG=$(checksum < "$tmp/cloudflared.env")
NUXT_CONFIG=$(echo "$APP_HOST" | checksum)

# Only these names are substituted.
export NAMESPACE=$NS APP_HOST IMAGE_PREFIX NUXT_TAG PB_TAG PB_CONFIG NUXT_CONFIG CLOUDFLARED_CONFIG
for f in k8s/app/*.yaml; do
  # shellcheck disable=SC2016 # the names are envsubst's to expand, not the shell's
  envsubst '${NAMESPACE} ${APP_HOST} ${IMAGE_PREFIX} ${NUXT_TAG} ${PB_TAG} ${PB_CONFIG} ${NUXT_CONFIG} ${CLOUDFLARED_CONFIG}' < "$f"
  echo '---'
done > "$tmp/app.yaml"
kubectl apply -f "$tmp/app.yaml"

# PocketBase first: Nuxt's migrate step and readiness check need it.
for d in pocketbase nuxt cloudflared; do
  kubectl -n "$NS" rollout status "deployment/$d" --timeout=6m
done
