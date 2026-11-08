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
   access token, encrypted with `BANK_LINK_KEY`. That key is made once:
   changing it later means every link must be made again. Plaid's keys are
   at [dashboard.plaid.com](https://dashboard.plaid.com) → Developers → Keys:
   the client ID, and the secret for the environment in `PLAID_ENV`
   (`sandbox` to try it with Plaid's test bank, `user_good` / `pass_good`;
   `production` for real banks, once Plaid approves it).
   ```sh
   openssl rand -hex 16 | tr -d '\n' | gh secret set BANK_LINK_KEY --env production -R garyvalley/cheddar
   gh secret set PLAID_CLIENT_ID --env production -R garyvalley/cheddar
   gh secret set PLAID_SECRET --env production -R garyvalley/cheddar
   gh variable set PLAID_ENV --body sandbox -R garyvalley/cheddar
   ```
   Then run the deploy again (`gh workflow run ci.yml --ref main -R garyvalley/cheddar`).
7. 👤 **Route,** once the tunnel shows **Healthy**: delete any DNS record for
   the host, then add the tunnel's public hostname
   `cheddar.poweredbycheese.com` → `http://nginx.cheddar.svc.cluster.local:80`.
   Cloudflare creates the DNS record. Until the pods are up and the tunnel
   connected, the host answers Cloudflare error 1033.

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
- Rotate the superuser: delete the `pocketbase-superuser` Secret (as admin)
  and deploy; PocketBase sets the new password on start.

## Not done yet

- **Backups.** There are none yet. Before real financial data goes in, add
  Litestream to the NAS as Homefile's `pb-replica` does, plus a restore drill.
- **Staging.** Homefile deploys to a staging namespace first; Cheddar
  deploys straight to production for now.
- **Uptime alerts.** No Healthchecks.io heartbeat yet.
