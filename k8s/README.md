# Cheddar on the Raspberry Pi cluster

Cheddar runs in its own `cheddar` namespace on the home k3s cluster, next to
Homefile, and is public at `https://<CLUSTER_HOST>` through a Cloudflare
Tunnel.

```
browser ──https──▶ Cloudflare ──tunnel──▶ cloudflared ──▶ nginx :8080 ──▶ nuxt :3000 ──▶ pocketbase :8090
                                          (outbound only)   country block,                (pb-data volume on
                                                            rate limits                     primary's SSD)
```

- **Nothing in the house listens to the internet.** cloudflared opens an
  outbound connection to Cloudflare; the router forwards no ports.
- **Only the request path is open** inside the cluster
  (`app/network-policy.yaml`): cloudflared → nginx → Nuxt → PocketBase.
  Nothing else reaches nginx, which is why it may trust the client address
  in `X-Forwarded-For` (from the pod network only) and the country in
  `CF-IPCountry`. PocketBase reaches only HTTPS on the internet (Mailjet).
- **The country block** is nginx's (`nginx/nginx.conf.template`): China,
  Russia, India, North Korea, Iran and Belarus get a 403. Change the list
  there. It reduces noise and isn't access control: a VPN walks past it.
- **Every pod is locked down:** non-root, read-only root filesystem, no
  privilege escalation, all capabilities dropped, no Kubernetes API token.
  The namespace enforces the `restricted` Pod Security Standard.
- **CI never reaches into the cluster.** GitHub-hosted runners build arm64
  images and push them to GHCR; a self-hosted runner on `primary`, labelled
  `cheddar`, picks up the `deploy` job and runs `scripts/deploy-k8s.sh`.
- **The deploy identity is namespaced.** The runner's kubeconfig is the
  `deployer` service account (`cluster/cheddar.yaml`): create and update in
  `cheddar`, read logs, no deletes, nothing cluster-wide.
- **The repository is the only source of configuration.** Each deploy writes
  the Secrets from the repository's secrets and variables.
- **Images are tagged with the commit** and pulled with the job's
  `GITHUB_TOKEN`, which GitHub revokes when the job ends.

| File | What |
| --- | --- |
| `cluster/cheddar.yaml` | Namespace, `deployer` account and its role. Applied by hand, once. |
| `app/pocketbase.yaml` | PocketBase, its 10 Gi volume and Service. One replica, `Recreate`. |
| `app/nuxt.yaml` | Nuxt and its `migrate` init container. |
| `app/nginx.yaml` | nginx: country block, rate limits, holding page. |
| `app/cloudflared.yaml` | The tunnel. |
| `app/network-policy.yaml` | Ingress and egress, closed except the request path. |

## First deploy

Done on 2026-11-08; kept for a rebuild. Steps a person must do are marked 👤
(Claude Code's auto mode refuses root services and secret writes).

1. 👤 **Namespace.** With the admin kubeconfig:
   `kubectl apply -f k8s/cluster/cheddar.yaml`
2. **Runner.** On `primary`, in `/home/gh-runner/actions-runner-cheddar`
   (runner `primary-cheddar`, label `cheddar`, same version as Homefile's
   runner, checked against the release's SHA-256), with its own kubeconfig
   at `/home/gh-runner/.kube/cheddar-config`, built on `primary` from the
   `cheddar/deployer-token` Secret (`server: https://127.0.0.1:6443`) and
   named in the runner's `.env` as `KUBECONFIG=…`. Then 👤 the service:
   ```sh
   ssh -t ubuntu@primary 'sudo bash -c "cd /home/gh-runner/actions-runner-cheddar && ./svc.sh install gh-runner && ./svc.sh start"'
   ```
3. **Repository settings:** variable `CLUSTER_HOST` =
   `cheddar.poweredbycheese.com`, and an environment `production` limited to
   the `main` branch.
4. 👤 **Tunnel.** Cloudflare → **Networking → Tunnels → Create Tunnel**
   (`cloudflared`), named `cheddar`. Copy the token from the install command
   (the long value after `--token`, not the tunnel ID); don't run the
   command anywhere, the deploy runs `cloudflared`. Then:
   ```sh
   gh secret set CLOUDFLARE_TUNNEL_TOKEN --env production -R garyvalley/cheddar
   ```
5. 👤 **Mail and deploy.** Homefile's Mailjet keys, then switch deploys on:
   ```sh
   cd ~/dev/cheddar && for k in MAILJET_API_KEY MAILJET_SECRET_KEY MAILJET_SENDER_EMAIL; do grep "^$k=" ../homefile/.env | cut -d= -f2- | tr -d '\n' | gh secret set "$k" --env production -R garyvalley/cheddar; done && gh variable set DEPLOY_ENABLED --body true -R garyvalley/cheddar && gh workflow run ci.yml --ref main -R garyvalley/cheddar
   ```
6. 👤 **Bank links** (optional; without these, linking stays off). People
   sign in to their bank through Plaid Link; Cheddar keeps only Plaid's
   access token, encrypted with the data key (step 8). Plaid's keys are
   at [dashboard.plaid.com](https://dashboard.plaid.com) → Developers → Keys:
   the client ID, and the secret for the environment in `PLAID_ENV`
   (`sandbox` to try it with Plaid's test bank, `user_good` / `pass_good`;
   `production` for real banks, once Plaid approves it).
   ```sh
   gh secret set PLAID_CLIENT_ID --env production -R garyvalley/cheddar
   gh secret set PLAID_SECRET --env production -R garyvalley/cheddar
   gh variable set PLAID_ENV --body sandbox -R garyvalley/cheddar
   ```
   Then run the deploy again (`gh workflow run ci.yml --ref main -R garyvalley/cheddar`).

   Plaid bills you for each linked bank, so new links stop at a limit:
   `PLAID_LINKS_PER_PERSON` (default 10) and `PLAID_MAX_LINKS` for the whole
   Cheddar (default 25 here, `0` for none). Signing in to a bank again never
   counts as a new link. When a limit is hit, PocketBase's log says
   `[bank_links] … limit of N reached`.
   ```sh
   gh variable set PLAID_MAX_LINKS --body 40 -R garyvalley/cheddar
   ```
7. 👤 **Who can sign up.** Production is invite-only: only addresses on the
   `SIGNUP_ALLOW` list can make an account, so strangers who find the site
   can't create billable bank links. List whole addresses or `@domain` for
   everyone at a domain, comma separated. It's a secret, since it names
   people, and anyone who already has an account keeps it.
   ```sh
   gh secret set SIGNUP_ALLOW --env production -R garyvalley/cheddar   # then paste: you@example.com, @family.example
   gh variable set SIGNUP --body invite -R garyvalley/cheddar          # or open (anyone) or closed (nobody new)
   ```
   Deploy again after a change. Refused sign-ups log `[signup] refused a new account`.
   A superuser can still make an account for anyone in the admin UI.
8. 👤 **Route,** once the tunnel shows **Healthy**: delete any DNS record for
   the host, then add the tunnel's public hostname
   `cheddar.poweredbycheese.com` → `http://nginx.cheddar.svc.cluster.local:80`.
   Cloudflare creates the DNS record. Until the pods are up and the tunnel
   connected, the host answers Cloudflare error 1033.
9. 👤 **Data key.** Two-step app secrets and bank links' access tokens are
   stored encrypted with it, and recovery codes hashed with it, so a copy of
   the database alone gives none of them away. Make it once, then deploy;
   the next night (or "Rotating the data key" step 2 now) seals the
   secrets already there. Keep `BANK_LINK_KEY` if it is set: it stays key
   `v1` for the links made with it.
   ```sh
   printf 'v2:%s' "$(openssl rand -hex 16)" | gh secret set DATA_KEYS --env production -R garyvalley/cheddar
   ```
   Without `DATA_KEYS` or `BANK_LINK_KEY`, two-step secrets stay unencrypted
   and bank linking is off.
10. 👤 **Uptime alerts** (optional). Make two checks at
    [healthchecks.io](https://healthchecks.io), each emailing you when pings
    stop: one with a 5-minute period (PocketBase pings it every 5 minutes, so
    a crashed or stuck PocketBase alerts), and one with a 1-day period for the
    daily bank sync (it pings `/fail`, with how many links failed, when any
    do). Then deploy again.
    ```sh
    gh variable set HEALTHCHECK_URL --body https://hc-ping.com/<uuid> -R garyvalley/cheddar
    gh variable set HEALTHCHECK_SYNC_URL --body https://hc-ping.com/<other uuid> -R garyvalley/cheddar
    ```

The zone settings Homefile needed (Bot Fight Mode, Email Address
Obfuscation and Rocket Loader off) are zone-wide, so they cover Cheddar too
(Homefile's k8s/README.md, "Cloudflare Tunnel"). IP Geolocation must stay on
for `CF-IPCountry`; nginx's log shows `country=` per request. Optionally,
add the host to Homefile's `Country block` custom rule so blocked countries
stop at Cloudflare's edge.

> 🔑 Credentials this creates: on `primary`, the runner's kubeconfig (full
> control of the `cheddar` namespace only) and its registration in
> `actions-runner-cheddar/.credentials*`; in the cluster, the Secrets
> `pocketbase-superuser` (made by the first deploy: `PB_SU_EMAIL=nuxt@cheddar.internal`
> and a random password), `pocketbase-env`, `cloudflared` and `ghcr`.
> Revoke the runner in GitHub's settings, and
> `kubectl -n cheddar delete secret deployer-token` for a new deploy token.

## Operations

- Pods: `ssh ubuntu@primary sudo k3s kubectl -n cheddar get pods` (the Mac's kubeconfig can't reach the API off the home network); logs: `… logs deploy/nuxt`.
- Who's visiting from where: `… logs deploy/nginx | grep -o 'country=[A-Z-]*' | sort | uniq -c`.
- PocketBase admin: `kubectl -n cheddar port-forward svc/pocketbase 8090`,
  then http://localhost:8090/_/ with the `pocketbase-superuser` Secret's login
  (`kubectl -n cheddar get secret pocketbase-superuser -o jsonpath='{.data.PB_SU_PASS}' | base64 -d`).
  Never change the schema there: write a migration.
- Someone who lost their phone and recovery codes: in the admin UI, clear
  `mfa_enabled` on their user record, after proving who they are some other
  way. Their next sign-in takes them to set up a new app.
- **Rotating the data key** (after a suspected leak, or now and then).
  `DATA_KEYS` is `id:<32 characters>` entries, newest first; new values are
  sealed with the first, and each value names the key that sealed it.
  1. Put a new key in front, keeping the old ones, and deploy:
     `gh secret set DATA_KEYS --env production -R garyvalley/cheddar`, pasting
     e.g. `v3:<openssl rand -hex 16>,v2:<the old one>`.
  2. Re-seal everything with it (it also runs every night at 04:41 UTC),
     with the superuser's token from the port-forward above:
     `curl -X POST -H "Authorization: $TOKEN" http://localhost:8090/api/data-keys/reseal`.
     It answers `{ current, resealed, unreadable, codes_on_old_keys }`.
  3. Recovery codes can't be re-hashed without the codes themselves:
     `codes_on_old_keys` people still have codes made with an old key. Wait
     until it is 0 (codes are remade when someone makes new ones in
     Settings), or accept that those people sign in with their app only and
     make new codes.
  4. Drop the old key from `DATA_KEYS` (and unset `BANK_LINK_KEY` once v1 is
     retired) and deploy. `unreadable` counts values on a key that is gone:
     those bank links must be linked again.
- Rotate the superuser: delete the `pocketbase-superuser` Secret (as admin)
  and deploy; PocketBase sets the new password on start.

## Not done yet

- **Backups.** There are none yet. Before real financial data goes in, add
  Litestream to the NAS as Homefile's `pb-replica` does, plus a restore drill.
- **Staging.** Homefile deploys to a staging namespace first; Cheddar
  deploys straight to production for now.
- **Uptime alerts** are wired (step 10) but off until the two URLs are set.
