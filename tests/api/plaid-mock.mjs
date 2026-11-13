// A stand-in Plaid for the API suite, so linking and syncing run end to end
// without Plaid or a real bank. Not a test file itself.
//
// PocketBase reaches it through PLAID_API_URL (CI: the Docker network's
// gateway; tests/README.md), with PLAID_CLIENT_ID and PLAID_SECRET set to
// CLIENT_ID and SECRET below.

import { createServer } from 'node:http'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'

export const CLIENT_ID = 'test-client-id'
export const SECRET = 'test-secret'

const id = () => randomBytes(8).toString('hex')
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

/** One bank sign-in's accounts and transactions; a test changes them between syncs. */
export function sampleBank() {
  const chk = `chk-${id()}`
  const card = `card-${id()}`
  return {
    institution: 'First Platypus Bank',
    accounts: [
      { account_id: chk, name: 'Plaid Checking', mask: '0000', type: 'depository', subtype: 'checking', balances: { current: 2450.17, available: 2400, iso_currency_code: 'USD' } },
      { account_id: card, name: 'Plaid Credit Card', mask: '3333', type: 'credit', subtype: 'credit card', balances: { current: 310.55, iso_currency_code: 'USD' } },
    ],
    // Every transaction Plaid knows, in the order it learned of them; /transactions/sync hands out what's after the cursor.
    events: [
      { kind: 'added', t: { transaction_id: `t-pay-${id()}`, account_id: chk, amount: -3200, date: daysAgo(20), name: 'PAYROLL ACME', merchant_name: null, pending: false } },
      { kind: 'added', t: { transaction_id: `t-rent-${id()}`, account_id: chk, amount: 1800, date: daysAgo(15), name: 'RENT', merchant_name: null, pending: false } },
      { kind: 'added', t: { transaction_id: `t-pend-${id()}`, account_id: chk, amount: 42.1, date: daysAgo(1), name: 'GROCER', merchant_name: 'Grocer', pending: true, personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_SUPERSTORES' } } },
      { kind: 'added', t: { transaction_id: `t-cafe-${id()}`, account_id: card, amount: 4.75, date: daysAgo(3), name: 'CAFE', merchant_name: 'Cafe', pending: false, personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } } },
    ],
    status: null, // or a Plaid error_code every call answers with
    calls: [],
  }
}

export async function startMock({ port = Number(process.env.PLAID_MOCK_PORT || 8097) } = {}) {
  const publicTokens = new Map() // public_token -> bank, until exchanged
  const items = new Map() // access_token -> { bank, itemId, removed, removals }
  // What Plaid signs its webhooks with (webhookFor, below).
  const webhookKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const webhookKid = `kid-${id()}`

  function answer(res, status, json) {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  }
  const error = (res, code, status = 400) => answer(res, status, { error_type: 'ITEM_ERROR', error_code: code, error_message: code, display_message: null })

  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    let body
    try { body = JSON.parse(raw || '{}') } catch { return error(res, 'INVALID_BODY') }
    if (req.method !== 'POST') return error(res, 'NOT_FOUND', 404)
    if (body.client_id !== CLIENT_ID || body.secret !== SECRET) return error(res, 'INVALID_API_KEYS')

    if (req.url === '/link/token/create') {
      if (!body.user?.client_user_id) return error(res, 'INVALID_FIELD')
      if (body.access_token && !items.has(body.access_token)) return error(res, 'INVALID_ACCESS_TOKEN')
      if (!body.access_token && !body.products?.includes('transactions')) return error(res, 'INVALID_FIELD')
      return answer(res, 200, { link_token: `link-sandbox-${id()}`, expiration: '', request_id: id() })
    }
    if (req.url === '/item/public_token/exchange') {
      const bank = publicTokens.get(body.public_token)
      if (!bank) return error(res, 'INVALID_PUBLIC_TOKEN')
      publicTokens.delete(body.public_token)
      const access = `access-sandbox-${id()}`
      items.set(access, { bank, itemId: `item-${id()}`, removed: false, removals: 0 })
      bank.access = access
      return answer(res, 200, { access_token: access, item_id: items.get(access).itemId, request_id: id() })
    }

    if (req.url === '/webhook_verification_key/get') {
      if (body.key_id !== webhookKid) return error(res, 'INVALID_WEBHOOK_VERIFICATION_KEY_ID')
      return answer(res, 200, { key: { ...webhookKey.publicKey.export({ format: 'jwk' }), kid: webhookKid, alg: 'ES256', use: 'sig', created_at: 1, expired_at: null }, request_id: id() })
    }

    const item = items.get(body.access_token)
    if (item && req.url === '/item/remove') item.removals++
    if (!item || item.removed) return error(res, 'INVALID_ACCESS_TOKEN')
    item.bank.calls.push({ path: req.url, cursor: body.cursor ?? null })
    if (item.bank.status) return error(res, item.bank.status)

    if (req.url === '/accounts/get') {
      return answer(res, 200, { accounts: item.bank.accounts, item: { item_id: item.itemId, institution_name: item.bank.institution }, request_id: id() })
    }
    if (req.url === '/transactions/sync') {
      // The cursor is how many events the caller has seen; two at a time, to exercise paging.
      const from = body.cursor ? Number(body.cursor) : 0
      const page = item.bank.events.slice(from, from + 2)
      const next = from + page.length
      return answer(res, 200, {
        added: page.filter(e => e.kind === 'added').map(e => e.t),
        modified: page.filter(e => e.kind === 'modified').map(e => e.t),
        removed: page.filter(e => e.kind === 'removed').map(e => ({ transaction_id: e.t.transaction_id, account_id: e.t.account_id })),
        next_cursor: String(next),
        has_more: next < item.bank.events.length,
        request_id: id(),
      })
    }
    if (req.url === '/item/webhook/update') {
      item.webhook = body.webhook
      return answer(res, 200, { item: { item_id: item.itemId, webhook: body.webhook }, request_id: id() })
    }
    if (req.url === '/item/remove') {
      item.removed = true
      return answer(res, 200, { request_id: id() })
    }
    return error(res, 'NOT_FOUND', 404)
  })
  await new Promise(resolve => server.listen(port, '0.0.0.0', resolve))

  return {
    /** What Plaid Link hands the page once someone signs in to `bank`. */
    publicToken(bank = sampleBank()) {
      const token = `public-sandbox-${randomBytes(16).toString('hex')}`
      publicTokens.set(token, bank)
      return { token, bank }
    },
    /** Whether Plaid was told to forget the bank's access. */
    removed: bank => !!items.get(bank.access)?.removed,
    /** How many times Plaid was asked to forget it, the first time included. */
    removals: bank => items.get(bank.access)?.removals ?? 0,
    /** The item id Plaid gave the bank's link. */
    itemId: bank => items.get(bank.access)?.itemId,
    /**
     * A webhook as Plaid sends it about `bank`: the exact body and its
     * Plaid-Verification JWT. `kid`, `iat` (seconds) and `bodyHash` change
     * what's signed, to make bad ones.
     */
    webhookFor(bank, { type = 'TRANSACTIONS', code = 'SYNC_UPDATES_AVAILABLE', kid = webhookKid, iat = Math.floor(Date.now() / 1000), bodyHash } = {}) {
      const raw = JSON.stringify({ webhook_type: type, webhook_code: code, item_id: items.get(bank.access)?.itemId, environment: 'sandbox' })
      const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url')
      const head = `${enc({ alg: 'ES256', kid, typ: 'JWT' })}.${enc({ iat, request_body_sha256: bodyHash ?? createHash('sha256').update(raw).digest('hex') })}`
      const sig = sign('sha256', Buffer.from(head), { key: webhookKey.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
      return { raw, jwt: `${head}.${sig}` }
    },
    close: () => new Promise(resolve => server.close(resolve)),
  }
}
