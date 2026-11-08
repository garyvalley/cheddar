# Cheddar

Personal-finance PWA: accounts, net worth, spending reports, projections, tax-aware ideas.
Architecture, usage and deploy: README.md; tests: tests/README.md; schema: migrations/README.md; cluster: k8s/README.md.
~/dev/CLAUDE.md applies too.

## Stack
Nuxt 4 (`app/`, `server/`) · PocketBase 0.40.6 (`pb_hooks/`, schema in `migrations/` applied by `scripts/migrate.mjs`) ·
production on the home k3s Pi cluster, namespace `cheddar`, public via Cloudflare Tunnel.
Multi-user from day one: every user's data is theirs alone; state and filing status are per-user settings (all 50 states + DC).

## Commands
- `pnpm run setup` once (PocketBase in Docker on :8095, superuser in `.env` as PB_SU_EMAIL/PB_SU_PASS), then `pnpm dev` (:3005); `pnpm dev:stop` stops PocketBase.
- Demo login (local only, made by setup): `demo@example.com` / `Cheddar-demo-1`.
- `pnpm lint` · `pnpm typecheck` · `pnpm test:unit` · `pnpm test:api` (needs the dev server or a build running) · `pnpm test:ui` (needs the production build on :3012).
- Production build locally: `pnpm build && PORT=3012 NUXT_POCKETBASE_URL=http://127.0.0.1:8095 node .output/server/index.mjs`.
- `node scripts/make-icons.mjs` after changing `shared/mark.ts`; `node --env-file=.env scripts/screenshots.mjs` refreshes README screenshots.
- Current TOTP code for a secret: `node -e "import('./tests/load-hook-module.mjs').then(({loadHookModule})=>{const t=loadHookModule('pb_hooks/lib/totp.js');console.log(t.codeAt('<SECRET>',t.stepAt(Date.now())))})"`.

## Workflow
- Work on a branch, open a PR, wait for every CI job, then merge; `main` deploys once `DEPLOY_ENABLED` is `true`.
- Deploy setup steps that need the user (runner, tunnel, secrets) are in k8s/README.md "First deploy".

## Gotchas
- Import shared TypeScript with the `.ts` extension (`./states.ts`): unit tests run it through Node's type stripping.
- Node's type stripping can't erase TS parameter properties (`constructor(readonly x)`): declare fields instead.
- The users collection has OTP enabled only because PocketBase refuses MFA without a second built-in method; `pb_hooks/two_step.pb.js` refuses every OTP request. Don't remove either half.
- `mfa_enabled` is set only by the two-step hooks; the record API can't change it. A locked-out user is reset by a superuser in the admin UI.
- Nuxt trusts `NUXT_CLIENT_IP_HEADER` for the rate limit: set it only where a proxy writes it (cluster: `cf-connecting-ip`; local and CI: `x-test-ip`).
- `server/data/` is not auto-imported: import `attempt`, `storeError`, `sessionFor` explicitly; `server/utils/` is.
- `app/error.vue` replaces `app.vue`, so the title template in app.vue doesn't apply there.
- Images run as uid/gid 10001 with a read-only root filesystem; anything that writes goes to `/tmp` or `/pb/pb_data`.
- pnpm's `trustPolicy: no-downgrade` refuses some old releases; add a reasoned entry under `trustPolicyExclude` in pnpm-workspace.yaml.
- Stop a local server with `lsof -ti tcp:<port> -sTCP:LISTEN | xargs kill`: without `-sTCP:LISTEN` it also kills the browser connected to it, which loses its cookies and looks like a sign-out bug.
- The preview server's launch config lives at ~/dev/.claude/launch.json (`cheddar`), not in this repo.
- Not verified until the first deploy: that cloudflared sends `X-Forwarded-Proto: https`, which the Origin check (`assertSameOrigin`) needs.
