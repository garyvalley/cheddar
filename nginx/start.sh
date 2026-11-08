#!/bin/sh
# Writes the site config from its template, with only these settings filled
# in (the config's own $variables are nginx's), then runs nginx. Here rather
# than the image's entrypoint scripts, which rewrite files the cluster's
# read-only root filesystem refuses.
set -eu
: "${NUXT_UPSTREAM:?NUXT_UPSTREAM is required, host:port}"
: "${RESOLVER:?RESOLVER is required}"
: "${REAL_IP_FROM:?REAL_IP_FROM is required}"
# shellcheck disable=SC2016 # the names are envsubst's to expand, not the shell's
envsubst '${NUXT_UPSTREAM} ${RESOLVER} ${REAL_IP_FROM}' < /etc/nginx/cheddar.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
