# Cheddar on the Raspberry Pi cluster

Cheddar runs in its own `cheddar` namespace on the home k3s cluster, next to
Homefile, and is public at `https://<CLUSTER_HOST>` through a Cloudflare
Tunnel.

```
browser ──https──▶ Cloudflare ──tunnel──▶ cloudflared ──▶ nuxt :3000 ──▶ pocketbase :8090
                                          (outbound only)                 (pb-data volume on primary's SSD)
```

- **Nothing in the house listens to the internet.** cloudflared opens an
  outbound connection to Cloudflare; the router forwards no ports.
- **Only the request path is open** inside the cluster
  (`app/network-policy.yaml`): cloudflared → Nuxt → PocketBase. Nuxt reaches
  nothing else; PocketBase reaches only HTTPS on the internet (Mailjet). That
  is also why Nuxt may trust `cf-connecting-ip` for the sign-in rate limit.
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
| `app/nuxt.yaml` | Nuxt and its `migrate` init container. One replica (the rate limit is in memory). |
| `app/cloudflared.yaml` | The tunnel. |
| `app/network-policy.yaml` | Ingress and egress, closed except the request path. |

## First deploy

The `deploy` job is off until the repository variable `DEPLOY_ENABLED` is
`true`, so `main` can exist before all this is done. In order:

1. **Namespace.** From the Mac, with the admin kubeconfig:
   ```sh
   kubectl apply -f k8s/cluster/cheddar.yaml
   ```
2. **Runner.** On `primary`, as Homefile's runner was set up (its
   k8s/README.md, "The runner on `primary`"), but in its own directory,
   `/home/gh-runner/actions-runner-cheddar`, registered to
   `garyvalley/cheddar` with the label `cheddar`, and with its own
   kubeconfig built from the `cheddar/deployer-token` Secret
   (`server: https://127.0.0.1:6443`), mode 600, named in the runner's `.env`
   as `KUBECONFIG=…`. Install it as a second systemd service.
3. **Tunnel.** In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel
   `cheddar` with the public hostname `cheddar.poweredbycheese.com` →
   `http://nuxt.cheddar.svc.cluster.local:3000`. Keep Rocket Loader and Email
   Address Obfuscation off for the zone: they inject script the CSP refuses.
4. **Repository settings** (GitHub → Settings → Secrets and variables → Actions):
   - variable `CLUSTER_HOST` = `cheddar.poweredbycheese.com`
   - secret `CLOUDFLARE_TUNNEL_TOKEN` = the tunnel's token
   - secrets `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_SENDER_EMAIL`
     (Homefile's Mailjet account works; its free plan sends 200 a day)
   - an environment `production` limited to the `main` branch
   - variable `DEPLOY_ENABLED` = `true`, last
5. **Deploy.** Re-run the latest `main` workflow, or push to `main`. The job
   ends with `scripts/healthcheck-k8s.sh` proving the public path.

> 🔑 Credentials this creates: on `primary`, the runner's kubeconfig (full
> control of the `cheddar` namespace only) and its registration in
> `actions-runner-cheddar/.credentials*`; in the cluster, the Secrets
> `pocketbase-superuser` (made by the first deploy: `PB_SU_EMAIL=nuxt@cheddar.internal`
> and a random password), `pocketbase-env`, `cloudflared` and `ghcr`.
> Revoke the runner in GitHub's settings, and
> `kubectl -n cheddar delete secret deployer-token` for a new deploy token.

## Operations

- Pods: `kubectl -n cheddar get pods`; logs: `kubectl -n cheddar logs deploy/nuxt`.
- PocketBase admin: `kubectl -n cheddar port-forward svc/pocketbase 8090`,
  then http://localhost:8090/_/ with the `pocketbase-superuser` Secret's login
  (`kubectl -n cheddar get secret pocketbase-superuser -o jsonpath='{.data.PB_SU_PASS}' | base64 -d`).
  Never change the schema there: write a migration.
- Someone who lost their phone and recovery codes: in the admin UI, clear
  `mfa_enabled` on their user record, after proving who they are some other way.
- Rotate the superuser: delete the `pocketbase-superuser` Secret (as admin)
  and deploy; PocketBase sets the new password on start.

## Not done yet

- **Backups.** There are none yet. Before real financial data goes in, add
  Litestream to the NAS as Homefile's `pb-replica` does, plus a restore drill.
- **Staging.** Homefile deploys to a staging namespace first; Cheddar
  deploys straight to production for now.
- **Uptime alerts.** No Healthchecks.io heartbeat yet.
