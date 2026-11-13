import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto'

/**
 * Checking a Plaid webhook (issue #36). Plaid signs each one: the
 * Plaid-Verification header is a JWT, ES256, whose `kid` names the public key
 * (fetched from Plaid, by PocketBase, which holds the Plaid keys) and whose
 * payload carries when it was made and the SHA-256 of the exact body. A
 * webhook counts only when the signature holds with that key, it is at most
 * five minutes old, and the body is the one that was signed.
 *
 * Plain values in and out, with node:crypto only, so the unit tests run it.
 */

/** A public key as Plaid hands it out. */
export interface JsonWebKey { kty?: string, crv?: string, x?: string, y?: string, kid?: string, alg?: string }

/** How old a webhook may be: Plaid's own advice. */
export const MAX_AGE_S = 5 * 60

const b64url = (text: string | undefined) => Buffer.from(text || '', 'base64url')

function part<T>(text: string | undefined): T | null {
  try {
    const v = JSON.parse(b64url(text || '').toString('utf8'))
    return v && typeof v === 'object' ? v as T : null
  }
  catch {
    return null
  }
}

/** The key id a Plaid-Verification JWT names, or "" when it isn't an ES256 JWT with one. */
export function keyIdOf(jwt: string): string {
  const header = part<{ alg?: unknown, kid?: unknown }>(String(jwt || '').split('.')[0])
  const kid = header && header.alg === 'ES256' && typeof header.kid === 'string' ? header.kid : ''
  return /^[A-Za-z0-9_-]{1,100}$/.test(kid) ? kid : ''
}

/**
 * Whether `jwt` is Plaid's signature for `rawBody` under `key` (a P-256 JWK)
 * at `nowMs`. Never throws: anything malformed is just not a webhook.
 */
export function verifyPlaidWebhook(rawBody: string, jwt: string, key: JsonWebKey | null, nowMs = Date.now()): boolean {
  if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || !key.x || !key.y) return false
  const parts = String(jwt || '').split('.')
  if (parts.length !== 3 || !keyIdOf(jwt)) return false
  const payload = part<{ iat?: unknown, request_body_sha256?: unknown }>(parts[1])
  if (!payload || typeof payload.iat !== 'number' || typeof payload.request_body_sha256 !== 'string') return false
  const age = nowMs / 1000 - payload.iat
  if (age > MAX_AGE_S || age < -60) return false
  try {
    const signed = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), {
      key: createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, format: 'jwk' }),
      dsaEncoding: 'ieee-p1363',
    }, b64url(parts[2]))
    if (!signed) return false
  }
  catch {
    return false
  }
  const want = Buffer.from(payload.request_body_sha256, 'utf8')
  const got = Buffer.from(createHash('sha256').update(rawBody, 'utf8').digest('hex'), 'utf8')
  return want.length === got.length && timingSafeEqual(want, got)
}

/**
 * Plaid's keys by id, kept for a day, so a webhook rarely waits on a fetch.
 * An id that turned out to be no key is remembered for ten minutes, and at
 * most `freshPer10Min` ids are fetched in any ten minutes, so made-up ids
 * posted to the public route can't make Cheddar call Plaid without end.
 */
export function keyCache(fetchKey: (kid: string) => Promise<JsonWebKey | null>, { freshPer10Min = 20, now = () => Date.now() } = {}) {
  const known = new Map<string, { key: JsonWebKey | null, until: number }>()
  let fetches: number[] = []
  return async function keyFor(kid: string): Promise<JsonWebKey | null> {
    const t = now()
    const hit = known.get(kid)
    if (hit && hit.until > t) return hit.key
    fetches = fetches.filter(at => t - at < 10 * 60_000)
    if (fetches.length >= freshPer10Min) return hit?.key ?? null
    fetches.push(t)
    const key = await fetchKey(kid)
    if (known.size > 200) known.clear()
    known.set(kid, { key, until: t + (key ? 24 * 60 : 10) * 60_000 })
    return key
  }
}
