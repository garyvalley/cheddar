// Unit tests for pb_hooks/lib/totp.js: authenticator-app codes for two-step
// sign-in, checked against the published test vectors and
// Node's own crypto.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { loadHookModule } from './load-hook-module.mjs'

const totp = loadHookModule('pb_hooks/lib/totp.js')

// RFC 6238 appendix B's SHA-1 secret, "12345678901234567890", in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' // gitleaks:allow -- the RFC's published test value

describe('sha1 and hmacSha1', () => {
  test('match Node for empty, short, block-sized and multi-block inputs', () => {
    for (const len of [0, 1, 55, 56, 63, 64, 65, 200]) {
      const bytes = randomBytes(len)
      assert.equal(Buffer.from(totp.sha1([...bytes])).toString('hex'), createHash('sha1').update(bytes).digest('hex'), `sha1 of ${len} bytes`)
    }
  })

  test('HMAC matches Node, including a key longer than a block', () => {
    for (const keyLen of [10, 20, 64, 100]) {
      const key = randomBytes(keyLen)
      const msg = randomBytes(8)
      assert.equal(Buffer.from(totp.hmacSha1([...key], [...msg])).toString('hex'),
        createHmac('sha1', key).update(msg).digest('hex'), `key of ${keyLen} bytes`)
    }
  })
})

describe('codeAt', () => {
  test('makes the RFC 6238 SHA-1 codes, to 8 digits', () => {
    for (const [seconds, code] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
      [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]) {
      assert.equal(totp.codeAt(RFC_SECRET, Math.floor(seconds / 30), 8), code, `T=${seconds}`)
    }
  })

  test('and the 6-digit codes an app shows, keeping leading zeros', () => {
    assert.equal(totp.codeAt(RFC_SECRET, Math.floor(1234567890 / 30)), '005924')
  })
})

describe('matchStep', () => {
  const now = 1234567890 * 1000
  const step = totp.stepAt(now)

  test('accepts the current code, and the one either side of it', () => {
    for (const s of [step - 1, step, step + 1]) assert.equal(totp.matchStep(RFC_SECRET, totp.codeAt(RFC_SECRET, s), now, 0), s)
  })

  test('refuses a code two steps away', () => {
    assert.equal(totp.matchStep(RFC_SECRET, totp.codeAt(RFC_SECRET, step - 2), now, 0), -1)
    assert.equal(totp.matchStep(RFC_SECRET, totp.codeAt(RFC_SECRET, step + 2), now, 0), -1)
  })

  test('refuses a code already used, or older than the last one used', () => {
    assert.equal(totp.matchStep(RFC_SECRET, totp.codeAt(RFC_SECRET, step), now, step), -1)
    assert.equal(totp.matchStep(RFC_SECRET, totp.codeAt(RFC_SECRET, step - 1), now, step), -1)
    assert.equal(totp.matchStep(RFC_SECRET, totp.codeAt(RFC_SECRET, step + 1), now, step), step + 1)
  })

  test('ignores spaces, and refuses anything that is not six digits', () => {
    const code = totp.codeAt(RFC_SECRET, step)
    assert.equal(totp.matchStep(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now, 0), step)
    for (const bad of ['', '12345', '1234567', 'abcdef', null]) assert.equal(totp.matchStep(RFC_SECRET, bad, now, 0), -1)
  })
})

test('otpauthUri names the issuer and account and states the algorithm', () => {
  assert.equal(totp.otpauthUri('ABC', 'admin@cheddar.test', 'Cheddar'),
    'otpauth://totp/Cheddar:admin%40cheddar.test?secret=ABC&issuer=Cheddar&algorithm=SHA1&digits=6&period=30')
})

test('base32Decode reads lower case and padding, and refuses other letters', () => {
  assert.deepEqual(totp.base32Decode('gezdgnbv'), [...Buffer.from('12345')])
  assert.deepEqual(totp.base32Decode('GEZDGNBV===='), [...Buffer.from('12345')])
  assert.throws(() => totp.base32Decode('GEZ1'))
})
