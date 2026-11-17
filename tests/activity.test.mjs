// Unit tests for shared/activity.ts: Recent activity's words, and that its
// kinds are the ones the security_events collection takes (migrations/0026, 0038).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACTIVITY_KINDS, describeActivity, isWarning } from '../shared/activity.ts'

const listIn = (file, name) => {
  const text = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
  return JSON.parse(text.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"').replace(/,\s*\]/, ']'))
}

test('every kind is one the collection takes, and the other way round', () => {
  // migrations/0026 made the list; later ones add to it.
  const kinds = [...listIn('0026_security_events.mjs', 'KINDS'), ...listIn('0038_passkeys.mjs', 'MORE_KINDS')]
  assert.deepEqual([...kinds].sort(), [...ACTIVITY_KINDS].sort())
})

test('each kind says what happened, with the bank when there is one', () => {
  for (const kind of ACTIVITY_KINDS) assert.ok(describeActivity({ kind, detail: '' }).length > 3, kind)
  assert.equal(describeActivity({ kind: 'bank_linked', detail: 'Chase' }), 'Bank linked: Chase')
  assert.equal(describeActivity({ kind: 'sign_in', detail: '' }), 'Signed in')
})

test('wrong codes and locks stand out', () => {
  assert.deepEqual(ACTIVITY_KINDS.filter(isWarning), ['code_wrong', 'codes_locked'])
})
