// One command from a fresh clone to a signed-in app:
//
//   pnpm run setup && pnpm dev
//
// Installs dependencies, writes .env from .env.example if there isn't one,
// starts PocketBase in Docker with a superuser, migrates the schema, and adds
// a confirmed demo account. Safe to re-run: what exists is left alone.
//
// It is `pnpm run setup`, not `pnpm setup`: pnpm's own `setup` command wins
// over a package.json script of the same name.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENV = `${ROOT}.env`
export const DEMO_EMAIL = 'demo@example.com'
export const DEMO_PASS = 'Cheddar-demo-1'

const step = m => console.log(`\n▸ ${m}`)
function fail(m) {
  console.error(`\n✗ ${m}`)
  process.exit(1)
}
function sh(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...options })
  if (r.error?.code === 'ENOENT') fail(`${cmd} isn't installed or isn't on your PATH.`)
  return r
}

step('Installing dependencies')
if (sh('pnpm', ['install']).status !== 0) fail('pnpm install failed (above).')

if (!existsSync(ENV)) {
  copyFileSync(`${ROOT}.env.example`, ENV)
  console.log('  wrote .env from .env.example')
}
const readEnv = () => Object.fromEntries(readFileSync(ENV, 'utf8').split('\n')
  .map(l => l.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
function setEnv(key, value) {
  const lines = readFileSync(ENV, 'utf8').replace(/\n$/, '').split('\n')
  const at = lines.findIndex(l => l.startsWith(`${key}=`))
  if (at === -1) lines.push(`${key}=${value}`)
  else lines[at] = `${key}=${value}`
  writeFileSync(ENV, `${lines.join('\n')}\n`)
}

// A random superuser password, kept in .env, so no well-known one exists.
let env = readEnv()
if (!env.PB_SU_EMAIL || !env.PB_SU_PASS) {
  setEnv('PB_SU_EMAIL', env.PB_SU_EMAIL || 'admin@example.com')
  setEnv('PB_SU_PASS', `${randomBytes(12).toString('base64url')}-Aa1`)
  env = readEnv()
  console.log('  added a superuser login to .env (PB_SU_EMAIL, PB_SU_PASS)')
}
const PB = `http://127.0.0.1:${env.PB_HOST_PORT || 8095}`
const APP = `http://localhost:${env.NUXT_DEV_PORT || 3005}`

step('Starting PocketBase in Docker')
if (sh('docker', ['info'], { stdio: 'ignore' }).status !== 0) fail('Docker isn\'t running. Start Docker Desktop and run this again.')
if (sh('docker', ['compose', 'up', '-d', '--build', 'pocketbase']).status !== 0) fail('docker compose up failed (above).')
const started = Date.now()
for (;;) {
  if (await fetch(`${PB}/api/health`).then(r => r.ok, () => false)) break
  if (Date.now() - started > 90_000) fail(`PocketBase didn't answer at ${PB}. \`docker compose logs pocketbase\` says why.`)
  await new Promise(r => setTimeout(r, 1000))
}
console.log(`  up at ${PB}`)

step('Migrating the schema')
if (sh('node', ['scripts/migrate.mjs'], { env: { ...process.env, ...env, PB_URL: PB } }).status !== 0) fail('The migration failed (above).')

step('Adding the demo account')
const call = async (path, method, body, token) => {
  const r = await fetch(`${PB}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
    body: body && JSON.stringify(body),
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) fail(`${method} ${path}: ${r.status} ${JSON.stringify(json)}`)
  return json
}
const { token } = await call('/api/collections/_superusers/auth-with-password', 'POST', { identity: env.PB_SU_EMAIL, password: env.PB_SU_PASS })
const found = await call(`/api/collections/users/records?filter=${encodeURIComponent(`email='${DEMO_EMAIL}'`)}`, 'GET', undefined, token)
if (found.items.length) {
  console.log(`  ${DEMO_EMAIL} is already there; left as it is`)
}
else {
  await call('/api/collections/users/records', 'POST', {
    email: DEMO_EMAIL, password: DEMO_PASS, passwordConfirm: DEMO_PASS, name: 'Demo', verified: true,
    state: 'CA', filing_status: 'single',
  }, token)
  console.log(`  made ${DEMO_EMAIL}`)
}

console.log(`
✓ Ready. Start the app with:

    pnpm dev

  App          ${APP}
  Demo login   ${DEMO_EMAIL} / ${DEMO_PASS} (sets up two-step sign-in on first sign-in)
  nginx        docker compose up -d nginx, then http://localhost:8085
  PocketBase   ${PB.replace('127.0.0.1', 'localhost')}/_/  (superuser in .env: PB_SU_EMAIL, PB_SU_PASS)
  Stop it      pnpm dev:stop
`)
