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
- Demo login (local only, made by setup): `demo@example.com` / `Cheddar-demo-1`; it sets up two-step sign-in on first sign-in like any account.
- `pnpm lint` · `pnpm typecheck` · `pnpm test:unit` · `pnpm test:api` (needs `pnpm dev` and `docker compose up -d nginx`: it runs through nginx on :8085) · `pnpm test:ui` (production build behind a second nginx; tests/README.md has the commands).
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
- Two-step sign-in is required and enforced by collection rules: every new collection's rules include `@request.auth.mfa_enabled = true` (migrations/README.md).
- Rate limits and the country block live only in nginx (`nginx/nginx.conf.template`); Nuxt has none, so test them through nginx (:8085), not the dev server.
- Only POSTs count toward nginx's limits (`$limit_key`); a GET a page makes as it loads must never be limited.
- nginx's `RESOLVER=127.0.0.11` works only on a user-defined Docker network (compose's, or CI's `cheddar-ci`); on the default bridge every request 503s.
- Docker tmpfs mounts need `mode=1777` for the non-root nginx; the cluster's emptyDirs are already world-writable.
- `server/data/` is not auto-imported: import `attempt`, `storeError`, `sessionFor` explicitly; `server/utils/` is.
- `app/error.vue` replaces `app.vue`, so the title template in app.vue doesn't apply there.
- Images run as uid/gid 10001 with a read-only root filesystem; anything that writes goes to `/tmp` or `/pb/pb_data`.
- pnpm's `trustPolicy: no-downgrade` refuses some old releases; add a reasoned entry under `trustPolicyExclude` in pnpm-workspace.yaml.
- Stop a local server with `lsof -ti tcp:<port> -sTCP:LISTEN | xargs kill`: without `-sTCP:LISTEN` it also kills the browser connected to it, which loses its cookies and looks like a sign-out bug.
- The preview server's launch config is `.claude/launch.json` (`cheddar`, port 3005), ignored by git: recreate it on a fresh clone.
- Cloudflare sends `CF-IPCountry` and `X-Forwarded-Proto: https` down the tunnel (verified live 2026-11-08); nginx logs `country=` per request.
- A route that answers 204 hands `$fetch` nothing: check it with `useAction().succeed()`, never by `run()`'s return value.
- Bank linking is Plaid, on only with `BANK_LINK_KEY`, `PLAID_CLIENT_ID` and `PLAID_SECRET`. `BANK_LINK_KEY` encrypts every link's access token: changing it means each person links again. Links live in `bank_links`, which only the hooks read (all rules null).
- Plaid Link loads from `cdn.plaid.com` and opens in its frame: keep both in the CSP (`nuxt.config.ts`). The container can't reach plaid.com; tests use `tests/api/plaid-mock.mjs` via `PLAID_API_URL`.
- Only `pb_hooks/categories.pb.js` writes a transaction's `category`, `category_by`, `merchant_key` and `bank_category` (the record API's writes to them are dropped); it sorts every transaction as it saves. The category list is in both `pb_hooks/lib/categories.js` and `shared/categories.ts`; a unit test keeps them equal.
- PDF statements: the browser takes the text out with pdf.js (`app/utils/pdf-text.ts`, worker served from `/_nuxt`, so the CSP needs nothing) and sends only that text, marked `%cheddar-pdf-text 1`; `shared/pdf-statements.ts` reads it on both sides. Signs come from CR/DR, the running balance, printed signs (turned round for cards), then section headings. Scanned PDFs have no text and can't be read.
- A statement can be imported into a linked account too. File ids and Plaid ids never match, so rows count as the same money by amount and a date at most 4 days apart: imports skip them (`shared/overlap.ts`), and a sync takes over the imported row and detaches it from its import (`pb_hooks/lib/overlap.js`, `pb_hooks/glue/plaid.js`). A unit test keeps the two copies equal.
- On the cluster, use `ssh ubuntu@primary sudo k3s kubectl -n cheddar …`: the Mac's kubeconfig can't reach the API off the home network.
- Overview's net worth, monthly income/spending and investment growth are `shared/overview.ts`. Growth needs past balances: `balance_history` (one row per account per day), written only by `pb_hooks/balances.pb.js` whenever an account's balance is saved (all write rules null). Unlinked accounts get a balance on Accounts (`PATCH /api/accounts/:id`).
- Projections is `shared/projections.ts`: savings rate from the last 6 whole months (not the current one), debt pace from each card/loan's transactions or else its `balance_history`. The assumptions (years, growth, monthly amount, each debt's payment and APR) are kept only in the browser's localStorage, per user.
- Taxes' state estimate is `shared/state-taxes.ts` (every wage-tax state + DC, from Tax Foundation's 2026 table); `STATES[].incomeTax` and it must agree (a unit test checks). Update it each autumn with `shared/taxes.ts`.
