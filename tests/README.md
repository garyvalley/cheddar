# Tests

| Suite | What it covers | Needs |
| --- | --- | --- |
| `pnpm test:unit` (`tests/*.test.mjs`) | Pure logic: authenticator codes (RFC 6238 vectors), recovery codes, lockout, passwords, profile rules, the state list, the rate limiter, sign-in redirects | Nothing |
| `pnpm test:api` (`tests/api/*.test.mjs`) | Sign-up, sign-in, two-step sign-in, sessions, deletion, profile, one person's data hidden from another, CSRF, the rate limit, security headers | PocketBase and Nuxt running |
| `pnpm test:ui` (`tests/ui.mjs`) | A browser signs up, sets up two-step sign-in, signs back in with a code, on desktop and phone sizes, with no console errors | PocketBase and the **production build**, Chrome |

The API suite and the UI test read `.env` for the superuser (`PB_SU_EMAIL`,
`PB_SU_PASS`) they clean up with, and delete every account they make.

## Running the API and UI suites locally

```bash
pnpm run setup          # once: PocketBase in Docker, schema, .env
pnpm dev                # the API suite runs against the dev server (:3005)
pnpm test:api
```

The Nuxt server must run with `NUXT_CLIENT_IP_HEADER=x-test-ip` (it's in
`.env.example`): each test then signs in from its own made-up address, and
only the rate-limit test reaches the limit.

The UI test runs against the production build, where the strict CSP applies:

```bash
pnpm build
PORT=3012 NUXT_POCKETBASE_URL=http://127.0.0.1:8095 node .output/server/index.mjs &
pnpm test:ui
```

CI (`.github/workflows/ci.yml`, job `integration`) runs both the same way,
against the PocketBase image.

A test for a bug must fail without the fix.
