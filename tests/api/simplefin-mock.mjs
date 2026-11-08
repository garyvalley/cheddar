// A stand-in SimpleFIN server for the API suite, so linking and syncing run
// end to end without SimpleFIN or a real bank. Not a test file itself.
//
// PocketBase must be allowed to call it: SIMPLEFIN_ALLOWED_ORIGINS on
// PocketBase includes SIMPLEFIN_MOCK_ORIGIN, the address PocketBase reaches
// this server at (CI: the Docker network's gateway; tests/README.md).

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

const day = s => Math.floor(Date.parse(`${s}T12:00:00Z`) / 1000)
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

/** The accounts one access answers with; a test changes them between syncs. */
export function sampleAccounts() {
  return [
    {
      id: `chk-${randomBytes(3).toString('hex')}`, name: 'Everyday Checking ...4821', conn_id: 'c1', currency: 'USD',
      balance: '2450.17', 'balance-date': day(today()),
      transactions: [
        { id: 't-pay', posted: day(daysAgo(20)), amount: '3200.00', description: 'PAYROLL ACME', payee: 'Acme' },
        { id: 't-rent', posted: day(daysAgo(15)), amount: '-1800.00', description: 'RENT', payee: '' },
        { id: 't-pend', posted: 0, transacted_at: day(daysAgo(1)), amount: '-42.10', description: 'GROCER', pending: true },
      ],
    },
    {
      id: `card-${randomBytes(3).toString('hex')}`, name: 'Rewards Visa', conn_id: 'c1', currency: 'USD',
      balance: '-310.55', 'balance-date': day(today()),
      transactions: [{ id: 't-cafe', posted: day(daysAgo(3)), amount: '-4.75', description: 'CAFE', payee: 'Cafe' }],
    },
  ]
}

export async function startMock({ port = Number(process.env.SIMPLEFIN_MOCK_PORT || 8097), origin = process.env.SIMPLEFIN_MOCK_ORIGIN } = {}) {
  const claims = new Map() // claim id -> access key, until spent
  const access = new Map() // "user:pass" -> { accounts, status, requests }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://mock')
    const claim = /^\/claim\/([a-f0-9]+)$/.exec(url.pathname)
    if (req.method === 'POST' && claim) {
      const key = claims.get(claim[1])
      if (!key) return res.writeHead(403).end('Forbidden')
      claims.delete(claim[1])
      const [user, pass] = key.split(':')
      return res.writeHead(200, { 'content-type': 'text/plain' }).end(`${origin.replace('://', `://${user}:${pass}@`)}/simplefin`)
    }
    if (req.method === 'GET' && url.pathname === '/simplefin/accounts') {
      const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString()
      const a = access.get(auth)
      if (!a) return res.writeHead(403).end('Forbidden')
      a.requests.push(Object.fromEntries(url.searchParams))
      if (a.status !== 200) return res.writeHead(a.status).end('No')
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        errlist: a.errlist || [],
        connections: [{ conn_id: 'c1', name: 'Mock Bank', org_id: 'o1', sfin_url: origin }],
        accounts: a.accounts,
      }))
    }
    res.writeHead(404).end()
  })
  await new Promise(resolve => server.listen(port, '0.0.0.0', resolve))

  return {
    /** A new setup token, and the state its access will answer with. */
    token(accounts = sampleAccounts()) {
      const id = randomBytes(8).toString('hex')
      const key = `${randomBytes(6).toString('hex')}:${randomBytes(12).toString('hex')}`
      claims.set(id, key)
      const state = { accounts, status: 200, requests: [], errlist: [] }
      access.set(key, state)
      return { token: Buffer.from(`${origin}/claim/${id}`).toString('base64'), state }
    },
    close: () => new Promise(resolve => server.close(resolve)),
  }
}
