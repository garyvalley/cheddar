// Unit tests for pb_hooks/lib/two_step.js: which second step a person is
// asked for, how recovery codes are made, shown and read, and which codes a
// sign-in accepts. pb_hooks/glue/two_step.js applies them to the user_totp
// row; the routes are covered by tests/api/auth.test.mjs.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { loadHookModule } from './load-hook-module.mjs'

const twoStep = loadHookModule('pb_hooks/lib/two_step.js')
const totp = loadHookModule('pb_hooks/lib/totp.js')
const sha256 = text => createHash('sha256').update(text).digest('hex')
const matches = (stored, raw) => stored === sha256(raw)
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const NOW = Date.parse('2026-11-06T12:00:00Z')

test('the second step is the app only once it is on and has a secret', () => {
  assert.equal(twoStep.method(false, SECRET), 'off')
  assert.equal(twoStep.method(true, ''), 'off')
  assert.equal(twoStep.method(true, SECRET), 'app')
})

test('ten recovery codes are shown formatted and stored only as hashes', () => {
  let n = 0
  const made = twoStep.newRecoveryCodes((length, alphabet) => alphabet.slice(n, n++ + length), sha256)
  assert.equal(made.codes.length, 10)
  assert.equal(made.codes[0], 'abcde-fghjk')
  assert.deepEqual(made.hashes, made.codes.map(c => sha256(twoStep.normaliseRecoveryCode(c))))
})

test("a stored recovery_codes value that isn't a JSON list holds none", () => {
  assert.deepEqual(twoStep.recoveryHashes('["a","b"]'), ['a', 'b'])
  for (const bad of ['', '{}', 'not json', null]) assert.deepEqual(twoStep.recoveryHashes(bad), [], String(bad))
})

describe('a code at sign-in', () => {
  const step = totp.stepAt(NOW)
  const row = { secret: SECRET, last_step: step - 2, hashes: [sha256('abcde23456'), sha256('fghjk78923')] }
  test("the app's current code is accepted, and its step is spent", () => {
    assert.deepEqual(twoStep.acceptCode(row, totp.codeAt(SECRET, step), NOW, matches), { kind: 'app', last_step: step })
  })
  test('a code at or before the last step used is refused', () => {
    assert.deepEqual(twoStep.acceptCode({ ...row, last_step: step }, totp.codeAt(SECRET, step), NOW, matches), { kind: '' })
  })
  test('a recovery code is accepted as typed, and only that one is spent', () => {
    assert.deepEqual(twoStep.acceptCode(row, ' FGHJK-78923 ', NOW, matches), { kind: 'recovery', hashes: [sha256('abcde23456')] })
    assert.equal(row.hashes.length, 2, 'the row passed in is left as it was')
  })
  test('a wrong code of either kind is refused', () => {
    assert.deepEqual(twoStep.acceptCode(row, '000000', NOW, matches), { kind: '' })
    assert.deepEqual(twoStep.acceptCode(row, 'zzzzz-zzzzz', NOW, matches), { kind: '' })
  })
})

test('a recovery code is shown as two groups of five', () => {
  assert.equal(twoStep.formatRecoveryCode('abcde23456'), 'abcde-23456')
})

test('a typed recovery code is read whatever its case, spaces and dashes', () => {
  for (const typed of ['abcde-23456', 'ABCDE-23456', ' abcde 23456 ', 'abcde23456']) {
    assert.equal(twoStep.normaliseRecoveryCode(typed), 'abcde23456', typed)
  }
  assert.equal(twoStep.normaliseRecoveryCode(undefined), '')
})
