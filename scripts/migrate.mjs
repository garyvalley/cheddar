// Brings PocketBase's schema up to date: applies each migration in
// migrations/ that the database hasn't had, in file-name order, and records
// it in the `schema_migrations` collection. migrations/README.md has the rules.
//
//   PB_URL=http://127.0.0.1:8095 PB_SU_EMAIL=… PB_SU_PASS=… node scripts/migrate.mjs
//   pnpm migrate     (the same, with .env)
//
// In the cluster it is the web pod's init container (k8s/app/nuxt.yaml), so a
// new version of the app never serves before its schema is there; in CI and
// in `pnpm run setup` it runs once PocketBase is up. It signs in as a
// superuser because only a superuser may change collections.
//
// Plain Node with no dependencies: the Nuxt image carries this file and
// migrations/ next to its build, and nothing else from the repository.
import { readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIR = fileURLToPath(new URL('../migrations/', import.meta.url))
const LEDGER = 'schema_migrations'

const base = (process.env.PB_URL || process.env.NUXT_POCKETBASE_URL || `http://127.0.0.1:${process.env.PB_HOST_PORT || 8095}`).replace(/\/$/, '')
const email = process.env.PB_SU_EMAIL
const password = process.env.PB_SU_PASS

function fail(message) {
  console.error(`[migrate] ${message}`)
  process.exit(1)
}

/** One request to PocketBase; throws with PocketBase's message on a non-2xx answer. */
async function send(method, path, { body, token } = {}) {
  const headers = {}
  if (token) headers.Authorization = token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  let parsed = text
  try { parsed = text ? JSON.parse(text) : null } catch { /* not JSON: keep the text */ }
  if (!r.ok) {
    const error = new Error(`${method} ${path}: HTTP ${r.status} ${JSON.stringify(parsed)}`)
    error.status = r.status
    throw error
  }
  return parsed
}

/** Waits for PocketBase to answer: in the cluster it may be restarting too. */
async function waitForPocketBase() {
  const until = Date.now() + 120_000
  for (;;) {
    const healthy = await fetch(`${base}/api/health`).then(r => r.ok, () => false)
    if (healthy) return
    if (Date.now() > until) fail(`PocketBase didn't answer at ${base}`)
    await new Promise(r => setTimeout(r, 2000))
  }
}

/**
 * What a migration is handed: requests as the superuser, and the two lookups
 * nearly every migration needs.
 */
function client(token) {
  const pb = {
    send: (method, path, body) => send(method, path, { body, token }),
    /** Every collection, system ones included. */
    collections: async () => (await pb.send('GET', '/api/collections?perPage=1000')).items,
    /** One collection by name, or null. */
    collection: name => pb.send('GET', `/api/collections/${encodeURIComponent(name)}`)
      .catch(e => (e.status === 404 ? null : Promise.reject(e))),
  }
  return pb
}

async function ensureLedger(pb) {
  if (await pb.collection(LEDGER)) return
  await pb.send('POST', '/api/collections', {
    name: LEDGER,
    type: 'base',
    // Null rules: only a superuser reads or writes it.
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'name', type: 'text', required: true, max: 200 },
      { name: 'applied', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: [`CREATE UNIQUE INDEX idx_schema_migrations_name ON ${LEDGER} (name)`],
  })
}

async function applied(pb) {
  const r = await pb.send('GET', `/api/collections/${LEDGER}/records?perPage=1000&fields=name`)
  return new Set(r.items.map(i => i.name))
}

if (!email || !password) fail('PB_SU_EMAIL and PB_SU_PASS must be set')
await waitForPocketBase()
const { token } = await send('POST', '/api/collections/_superusers/auth-with-password',
  { body: { identity: email, password } }).catch(e => fail(`superuser sign-in failed: ${e.message}`))
const pb = client(token)

await ensureLedger(pb)
const done = await applied(pb)
const files = readdirSync(DIR).filter(f => /^\d{4}_[a-z0-9_]+\.mjs$/.test(f)).sort()
let ran = 0
for (const file of files) {
  const name = file.replace(/\.mjs$/, '')
  if (done.has(name)) continue
  const { default: up } = await import(pathToFileURL(`${DIR}${file}`).href)
  try {
    await up(pb)
  }
  catch (e) {
    fail(`${name} failed, and nothing after it ran: ${e.message}`)
  }
  await pb.send('POST', `/api/collections/${LEDGER}/records`, { name })
  console.log(`[migrate] applied ${name}`)
  ran++
}
console.log(`[migrate] up to date (${ran} applied, ${files.length} in all)`)

