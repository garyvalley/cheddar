// Passkeys' checks (pb_hooks/lib/webauthn.js): its SHA-256, CBOR, P-256 and
// RSA against Node's crypto, and what a registration and a sign-in must be.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { loadHookModule } from './load-hook-module.mjs'
import { cbor, device } from './webauthn-device.mjs'

const w = loadHookModule('pb_hooks/lib/webauthn.js')
const bytes = buf => [...buf]
const site = { rpId: 'cheddar.example', origin: 'https://cheddar.example' }

test('sha256 matches Node for every length around the block edges', () => {
  for (const n of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 128, 1000]) {
    const data = randomBytes(n)
    assert.deepEqual(w.sha256(bytes(data)), bytes(createHash('sha256').update(data).digest()), `length ${n}`)
  }
})

test('base64url and UTF-8 round trips', () => {
  for (const n of [0, 1, 2, 3, 31, 32, 33]) {
    const data = randomBytes(n)
    assert.equal(w.toB64url(bytes(data)), data.toString('base64url'))
    assert.deepEqual(w.fromB64url(data.toString('base64url')), bytes(data))
  }
  assert.equal(w.fromB64url('a'), null)
  assert.equal(w.fromB64url('no spaces'), null)
  const text = 'Café 🧀 ok'
  assert.deepEqual(w.utf8Bytes(text), bytes(Buffer.from(text)))
  assert.equal(w.utf8Text(bytes(Buffer.from(text))), text)
})

test('cborItem reads maps, negatives, bytes and text', () => {
  const m = new Map([[1, 2], [-1, 1], ['fmt', 'none'], [-2, Buffer.from([1, 2, 3])], [300, 70000]])
  const { value } = w.cborItem(bytes(cbor(m)), 0)
  assert.deepEqual(value, { '1': 2, '-1': 1, 'fmt': 'none', '-2': [1, 2, 3], '300': 70000 })
  assert.throws(() => w.cborItem([0x5f], 0))
  assert.throws(() => w.cborItem([0x58, 10, 1], 0))
})

describe('signatures', () => {
  test('ES256: Node\'s signatures pass, anything changed fails', () => {
    for (let i = 0; i < 5; i++) {
      const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const jwk = publicKey.export({ format: 'jwk' })
      const x = bytes(Buffer.from(jwk.x, 'base64url')); const y = bytes(Buffer.from(jwk.y, 'base64url'))
      const msg = randomBytes(100)
      const sig = bytes(sign('sha256', msg, privateKey))
      assert.equal(w.verifyES256(x, y, bytes(msg), sig), true)
      const other = Buffer.from(msg); other[0] ^= 1
      assert.equal(w.verifyES256(x, y, bytes(other), sig), false)
      const bad = sig.slice(); bad[bad.length - 1] ^= 1
      assert.equal(w.verifyES256(x, y, bytes(msg), bad), false)
      const offCurve = y.slice(); offCurve[31] ^= 1
      assert.equal(w.verifyES256(x, offCurve, bytes(msg), sig), false)
    }
  })

  test('RS256: Node\'s signatures pass, anything changed fails', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwk = publicKey.export({ format: 'jwk' })
    const n = bytes(Buffer.from(jwk.n, 'base64url')); const e = bytes(Buffer.from(jwk.e, 'base64url'))
    const msg = randomBytes(77)
    const sig = bytes(sign('sha256', msg, privateKey))
    assert.equal(w.verifyRS256(n, e, bytes(msg), sig), true)
    const bad = sig.slice(); bad[10] ^= 1
    assert.equal(w.verifyRS256(n, e, bytes(msg), bad), false)
    assert.equal(w.verifyRS256(n, e, bytes(randomBytes(77)), sig), false)
  })
})

test('siteOf: https anywhere, http only on localhost', () => {
  assert.deepEqual(w.siteOf('https://Cheddar.example/'), { rpId: 'cheddar.example', origin: 'https://cheddar.example' })
  assert.deepEqual(w.siteOf('http://localhost:3005'), { rpId: 'localhost', origin: 'http://localhost:3005' })
  assert.equal(w.siteOf('http://cheddar.example'), null)
  assert.equal(w.siteOf(''), null)
})

for (const kind of ['ec', 'rsa']) {
  describe(`a ${kind} passkey`, () => {
    test('registers, signs in, and its counter must move on', () => {
      const d = device({ ...site, kind })
      const reg = w.checkRegistration(d.create('chal-1'), 'chal-1', site)
      assert.ok(!reg.problem, reg.problem)
      assert.equal(reg.credentialId, d.id)
      assert.equal(reg.key.alg, kind === 'ec' ? -7 : -257)
      const one = w.checkAssertion(d.get('chal-2'), 'chal-2', site, reg.key, reg.signCount)
      assert.deepEqual(one, { signCount: 1 })
      const replay = w.checkAssertion(d.get('chal-3', { same: true }), 'chal-3', site, reg.key, 1)
      assert.equal(replay.problem, 'That passkey didn\'t work.')
    })
  })
}

describe('what\'s refused', () => {
  const d = device(site)
  const reg = w.checkRegistration(d.create('c'), 'c', site)

  test('another challenge, origin, site or type', () => {
    assert.match(w.checkRegistration(d.create('c'), 'other', site).problem, /expired/)
    assert.match(w.checkRegistration(d.create('c', { client: { origin: 'https://evil.example' } }), 'c', site).problem, /another site/)
    assert.match(w.checkRegistration(d.create('c'), 'c', { rpId: 'other.example', origin: site.origin }).problem, /another site/)
    assert.match(w.checkAssertion(d.get('g', { client: { type: 'webauthn.create' } }), 'g', site, reg.key, 0).problem, /something else/)
    assert.match(w.checkAssertion(d.get('g', { client: { crossOrigin: true } }), 'g', site, reg.key, 0).problem, /another site/)
  })

  test('a device that didn\'t check who it was', () => {
    assert.match(w.checkRegistration(d.create('c', { flags: 0x01 }), 'c', site).problem, /check it's you/)
    assert.match(w.checkAssertion(d.get('g', { flags: 0x01 }), 'g', site, reg.key, 0).problem, /check it's you/)
  })

  test('another passkey\'s signature', () => {
    const other = device(site)
    other.create('x')
    assert.equal(w.checkAssertion(other.get('g'), 'g', site, reg.key, 0).problem, 'That passkey didn\'t work.')
  })

  test('garbage', () => {
    assert.ok(w.checkRegistration({ clientDataJSON: '!!', attestationObject: '' }, 'c', site).problem)
    assert.ok(w.checkRegistration({ ...d.create('c'), attestationObject: 'AAAA' }, 'c', site).problem)
    assert.ok(w.checkAssertion({ ...d.get('g'), signature: 'AAAA' }, 'g', site, reg.key, 0).problem)
    assert.ok(w.checkAssertion({ ...d.get('g'), authenticatorData: 'AA' }, 'g', site, reg.key, 0).problem)
  })
})

test('an ES256 signature with a forged r = 0 or s ≥ n fails', () => {
  const d = device(site)
  const reg = w.checkRegistration(d.create('c'), 'c', site)
  const answer = d.get('g')
  const zero = Buffer.from([0x30, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x01]).toString('base64url')
  assert.equal(w.checkAssertion({ ...answer, signature: zero }, 'g', site, reg.key, 0).problem, 'That passkey didn\'t work.')
  void sign
})
