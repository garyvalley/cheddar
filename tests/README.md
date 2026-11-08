# Tests

| Suite | What it covers | Needs |
| --- | --- | --- |
| `pnpm test:unit` (`tests/*.test.mjs`) | Pure logic: authenticator codes (RFC 6238 vectors), recovery codes, lockout, passwords, profile rules, the state list, sign-in redirects, reading bank CSV, OFX and QFX files, account rules, reading SimpleFIN tokens and answers | Nothing |
| `pnpm test:api` (`tests/api/*.test.mjs`) | Sign-up, sign-in, required two-step sign-in, sessions, deletion, profile, accounts, statement imports (dedup, undo, a few-megabyte file through nginx), linking and syncing banks against a stand-in SimpleFIN, one person's data hidden from another, even straight from PocketBase, CSRF, nginx's rate limits and country block, security headers | PocketBase, Nuxt and nginx running |
| `pnpm test:ui` (`tests/ui.mjs`) | A browser signs up, is held at two-step setup until it's on, sets the profile, adds an account, previews and imports a CSV, sees it on Spending and undoes it, signs back in with a code, on desktop and phone sizes, with no console errors | PocketBase, the **production build** behind nginx, Chrome |

`tests/api/helpers.mjs` holds what the API suites share (the client, new
accounts with and without two-step sign-in, the cleanup).

The API suite and the UI test read `.env` for the superuser (`PB_SU_EMAIL`,
`PB_SU_PASS`) they clean up with, and delete every account they make.

## Running the API and UI suites locally

Both run through nginx, as production does: the country block and rate
limits are part of what they test.

```bash
pnpm run setup                 # once: PocketBase in Docker, schema, .env
pnpm dev                       # Nuxt on :3005
docker compose up -d nginx     # nginx on :8085, in front of :3005
pnpm test:api
```

nginx here trusts any `X-Forwarded-For` (`REAL_IP_FROM=0.0.0.0/0` in
`docker-compose.yml`), so each test client signs in from a made-up address
of its own and only the rate-limit tests reach a limit. The cluster trusts
only the pod network.

The bank-link tests start a stand-in SimpleFIN server on port 8097
(`tests/api/simplefin-mock.mjs`) and run only when `SIMPLEFIN_MOCK_ORIGIN`
says where PocketBase reaches it. PocketBase must allow that origin and have
a key. Locally, with PocketBase in Docker, put these in `.env` and restart it
(`docker compose up -d pocketbase`):

```bash
SIMPLEFIN_ALLOWED_ORIGINS=https://beta-bridge.simplefin.org,https://bridge.simplefin.org,http://host.docker.internal:8097
SIMPLEFIN_MOCK_ORIGIN=http://host.docker.internal:8097
```

The UI test runs against the production build, where the strict CSP applies,
with a second nginx in front of it:

```bash
pnpm build
PORT=3012 NUXT_POCKETBASE_URL=http://127.0.0.1:8095 node .output/server/index.mjs &
NUXT_UPSTREAM=host.docker.internal:3012 NGINX_HOST_PORT=8086 docker compose -p cheddar-uitest up -d nginx
APP_URL=http://localhost:8086 pnpm test:ui
```

CI (`.github/workflows/ci.yml`, job `integration`) runs both the same way,
against the PocketBase and nginx images.

A test for a bug must fail without the fix.
