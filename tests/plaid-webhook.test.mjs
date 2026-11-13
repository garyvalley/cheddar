// Unit tests for server/data/plaid-webhook.ts: a Plaid webhook counts only
// with Plaid's ES256 signature over a recent iat and the exact body's
// SHA-256, and made-up key ids can't make Cheddar call Plaid without end.
// tests/api/bank-links.test.mjs posts real ones through Nuxt.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { keyCache, keyIdOf, verifyPlaidWebhook } from '../server/data/plaid-webhook.ts'

const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const other = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = pair.publicKey.export({ format: 'jwk' })
const NOW = 1_800_000_000_000
const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url')

function jwtFor(raw, { key = pair.privateKey, header = { alg: 'ES256', kid: 'k1', typ: 'JWT' }, iat = NOW / 1000, hash } = {}) {
  const head = `${enc(header)}.${enc({ iat, request_body_sha256: hash ?? createHash('sha256').update(raw).digest('hex') })}`
  return `${head}.${sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}

const RAW = '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-1"}'

describe('verifyPlaidWebhook', () => {
  test('takes a webhook Plaid signed, for this body, made in the last five minutes', () => {
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW), jwk, NOW), true)
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW, { iat: NOW / 1000 - 299 }), jwk, NOW), true)
  })

  test('refuses another key, another body, an old one, or a malformed one', () => {
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW, { key: other.privateKey }), jwk, NOW), false)
    assert.equal(verifyPlaidWebhook(`${RAW} `, jwtFor(RAW), jwk, NOW), false)
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW, { hash: 'ab' }), jwk, NOW), false)
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW, { iat: NOW / 1000 - 301 }), jwk, NOW), false)
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW, { header: { alg: 'none', kid: 'k1' } }), jwk, NOW), false)
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW), null, NOW), false)
    assert.equal(verifyPlaidWebhook(RAW, jwtFor(RAW), { kty: 'RSA' }, NOW), false)
    for (const bad of ['', 'a.b', 'a.b.c', `${jwtFor(RAW)}.x`]) assert.equal(verifyPlaidWebhook(RAW, bad, jwk, NOW), false, bad)
  })

  test('reads the key id only from an ES256 header', () => {
    assert.equal(keyIdOf(jwtFor(RAW)), 'k1')
    assert.equal(keyIdOf(jwtFor(RAW, { header: { alg: 'HS256', kid: 'k1' } })), '')
    assert.equal(keyIdOf(jwtFor(RAW, { header: { alg: 'ES256', kid: '../x' } })), '')
    assert.equal(keyIdOf('garbage'), '')
  })
})

describe('keyCache', () => {
  test('fetches a key once a day, a missing one once in ten minutes, and only so many ids in ten minutes', async () => {
    let t = 0
    const asked = []
    const keyFor = keyCache(async (kid) => { asked.push(kid); return kid === 'real' ? jwk : null }, { freshPer10Min: 3, now: () => t })
    assert.equal(await keyFor('real'), jwk)
    assert.equal(await keyFor('real'), jwk)
    assert.equal(await keyFor('nope'), null)
    assert.equal(await keyFor('nope'), null)
    assert.deepEqual(asked, ['real', 'nope'])
    await keyFor('a')
    await keyFor('b')
    assert.deepEqual(asked, ['real', 'nope', 'a'], 'three fresh ids in ten minutes, then none')
    t = 11 * 60_000
    await keyFor('nope')
    assert.equal(await keyFor('real'), jwk)
    assert.deepEqual(asked, ['real', 'nope', 'a', 'nope'])
    t = 25 * 60 * 60_000
    await keyFor('real')
    assert.equal(asked.at(-1), 'real')
  })
})
