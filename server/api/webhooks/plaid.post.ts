import { anonymous } from '~~/server/data/session'
import { keyCache, keyIdOf, verifyPlaidWebhook, type JsonWebKey } from '~~/server/data/plaid-webhook'

// Plaid's keys, fetched through PocketBase (which holds the Plaid settings)
// and kept in this process.
const keyFor = keyCache(async (kid) => {
  try {
    const got = await anonymous().send<{ key: JsonWebKey }>('/api/bank-links/webhook-key', { query: { kid } })
    return got.key || null
  }
  catch {
    return null
  }
})

/**
 * POST /api/webhooks/plaid: Plaid saying a link has new transactions or needs
 * attention (issue #36). Public, as Plaid calls it; it counts only with a
 * valid Plaid-Verification signature (server/data/plaid-webhook.ts), and then
 * PocketBase syncs that link (pb_hooks/bank_links.pb.js). Answers at once, so
 * Plaid never waits on the sync.
 */
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) || ''
  const jwt = getHeader(event, 'plaid-verification') || ''
  const kid = raw.length <= 64 * 1024 ? keyIdOf(jwt) : ''
  if (!kid || !verifyPlaidWebhook(raw, jwt, await keyFor(kid))) {
    throw createError({ statusCode: 400, statusMessage: 'Not a webhook from Plaid' })
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Not a webhook from Plaid' })
  }
  anonymous().send('/api/bank-links/webhook', { method: 'POST', body }).catch((err: unknown) => {
    console.error('[webhooks] passing a Plaid webhook on failed:', (err as Error)?.message || err)
  })
  setResponseStatus(event, 200)
  return { ok: true }
})
