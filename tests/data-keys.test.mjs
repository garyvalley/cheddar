// Unit tests for pb_hooks/lib/data_keys.js: which keys DATA_KEYS and
// BANK_LINK_KEY give, sealing with the newest, opening with whichever made a
// value, and recovery codes' HMACs. AES-GCM and HMAC here stand in for
// PocketBase's $security.encrypt, decrypt and hs256; the hooks that use it
// are covered by tests/api/auth.test.mjs and bank-links.test.mjs.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { loadHookModule } from './load-hook-module.mjs'

const dk = loadHookModule('pb_hooks/lib/data_keys.js')

const encrypt = (text, key) => {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', Buffer.from(key), iv)
  return Buffer.concat([iv, c.update(text), c.final(), c.getAuthTag()]).toString('base64')
}
const decrypt = (text, key) => {
  const b = Buffer.from(text, 'base64')
  const d = createDecipheriv('aes-256-gcm', Buffer.from(key), b.subarray(0, 12))
  d.setAuthTag(b.subarray(b.length - 16))
  return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString()
}
const sha256 = text => createHash('sha256').update(text).digest('hex')
const hs256 = (text, secret) => createHmac('sha256', secret).update(text).digest('hex')

const A = 'a'.repeat(32)
const B = 'b'.repeat(32)
const OLD = 'o'.repeat(32)

describe('the key set', () => {
  test('is DATA_KEYS newest first, with BANK_LINK_KEY as v1 when it names none', () => {
    const set = dk.parse(`v3:${A}, v2:${B}`, OLD)
    assert.equal(set.current, 'v3')
    assert.deepEqual(Object.keys(set.keys), ['v3', 'v2', 'v1'])
    assert.equal(set.keys.v1, OLD)
    assert.equal(dk.parse(`v1:${A}`, OLD).keys.v1, A, "DATA_KEYS's v1 wins")
  })

  test('is BANK_LINK_KEY alone before DATA_KEYS, and none without either', () => {
    assert.deepEqual(dk.parse('', OLD), { current: 'v1', keys: { v1: OLD }, problems: [] })
    const none = dk.parse('', '')
    assert.equal(dk.hasKey(none), false)
  })

  test('leaves out a bad entry and says which, never the key', () => {
    const set = dk.parse(`v2:short,V3:${A},v4:${B},v4:${A},nocolon`, '')
    assert.deepEqual(Object.keys(set.keys), ['v4'])
    assert.equal(set.keys.v4, B)
    assert.equal(set.problems.length, 4)
    for (const p of set.problems) assert.ok(!p.includes(A) && !p.includes('short'), p)
  })
})

describe('sealing', () => {
  const set = dk.parse(`v2:${B}`, OLD)

  test('seals with the newest key and opens with it', () => {
    const sealed = dk.seal(set, 'JBSWY3DPEHPK3PXP', encrypt)
    assert.match(sealed, /^v2:/)
    assert.ok(!sealed.includes('JBSWY3DPEHPK3PXP'))
    assert.equal(dk.open(set, sealed, decrypt, 'plain'), 'JBSWY3DPEHPK3PXP')
    assert.equal(dk.isCurrent(set, sealed), true)
  })

  test('opens a value an older key sealed, while that key is listed', () => {
    const before = dk.seal(dk.parse(`v1:${OLD}`, ''), 'secret', encrypt)
    assert.equal(dk.open(set, before, decrypt), 'secret')
    assert.equal(dk.isCurrent(set, before), false)
    assert.equal(dk.open(dk.parse(`v2:${B}`, ''), before, decrypt), null, 'v1 retired')
  })

  test('reads a value with no id as plain, or as sealed with BANK_LINK_KEY', () => {
    assert.equal(dk.open(set, 'JBSWY3DPEHPK3PXP', decrypt, 'plain'), 'JBSWY3DPEHPK3PXP')
    assert.equal(dk.open(set, encrypt('access-sandbox-1', OLD), decrypt, 'v1'), 'access-sandbox-1')
    assert.equal(dk.isCurrent(set, 'JBSWY3DPEHPK3PXP'), false)
  })

  test("gives null for a value that won't decrypt, and leaves empty empty", () => {
    assert.equal(dk.open(set, `v2:${encrypt('x', A)}`, decrypt), null)
    assert.equal(dk.open(set, 'v2:garbage', decrypt), null)
    assert.equal(dk.open(set, '', decrypt), '')
    assert.equal(dk.seal(set, '', encrypt), '')
  })

  test('keeps a value as it is with no key', () => {
    const none = dk.parse('', '')
    assert.equal(dk.seal(none, 'JBSWY3DPEHPK3PXP', encrypt), 'JBSWY3DPEHPK3PXP')
    assert.equal(dk.isCurrent(none, 'JBSWY3DPEHPK3PXP'), true)
  })
})

describe('recovery codes', () => {
  test("are an HMAC with the newest key's own code key, not the key itself", () => {
    const set = dk.parse(`v2:${B}`, '')
    const stored = dk.hashCode(set, 'abcde23456', sha256, hs256)
    assert.match(stored, /^v2:[0-9a-f]{64}$/)
    assert.notEqual(stored, `v2:${hs256('abcde23456', B)}`)
    assert.equal(dk.codeMatches(set, stored, 'abcde23456', sha256, hs256), true)
    assert.equal(dk.codeMatches(set, stored, 'abcde23457', sha256, hs256), false)
  })

  test('made before keys (bare SHA-256) still match, and ones on a retired key do not', () => {
    const set = dk.parse(`v2:${B}`, '')
    assert.equal(dk.codeMatches(set, sha256('abcde23456'), 'abcde23456', sha256, hs256), true)
    const old = dk.hashCode(dk.parse(`v1:${OLD}`, ''), 'abcde23456', sha256, hs256)
    assert.equal(dk.codeMatches(set, old, 'abcde23456', sha256, hs256), false)
    assert.equal(dk.codeMatches(dk.parse(`v2:${B},v1:${OLD}`, ''), old, 'abcde23456', sha256, hs256), true)
  })

  test('are bare SHA-256 with no key', () => {
    assert.equal(dk.hashCode(dk.parse('', ''), 'abcde23456', sha256, hs256), sha256('abcde23456'))
  })
})
