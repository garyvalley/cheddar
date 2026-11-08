// Unit tests for shared/passwords.ts: the rule for a new password,
// length and a list of common passwords, with no composition rules.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMMON_PASSWORDS, MIN_LENGTH, passwordProblem } from '../shared/passwords.ts'

test('refuses anything shorter than 12 characters, however mixed', () => {
  assert.equal(MIN_LENGTH, 12)
  for (const pw of ['', 'Password1', 'Xq7!vR2#pL9', undefined, null]) {
    assert.match(passwordProblem(pw), /at least 12 characters/, String(pw))
  }
})

test('refuses common passwords, whatever their case', () => {
  for (const pw of ['password1234', 'Password1234', 'QWERTYUIOP123', '1q2w3e4r5t6y', 'qwertyqwerty']) {
    assert.match(passwordProblem(pw), /most common/, pw)
  }
})

test('accepts a long password with no digits, capitals or symbols', () => {
  for (const pw of ['correct horse battery', 'plainlowercasewords', 'Test-pass-2026']) {
    assert.equal(passwordProblem(pw), '', pw)
  }
})

test('a name an object inherits is not mistaken for a listed password', () => {
  assert.equal(passwordProblem('hasownproperty'), '')
  assert.equal(passwordProblem('propertyisenumerable'), '')
})

test('the list holds only lowercase entries long enough to pass the length check', () => {
  const list = COMMON_PASSWORDS
  assert.ok(list.length > 1000, `${list.length} entries`)
  assert.equal(new Set(list).size, list.length, 'no duplicates')
  for (const p of list) {
    assert.equal(p, p.toLowerCase(), p)
    assert.ok(p.length >= MIN_LENGTH, p)
  }
})
