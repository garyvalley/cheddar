// Unit tests for app/utils/errors.ts: where sign-in may send someone next.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeNext } from '../app/utils/errors.ts'

test('keeps a path on this site', () => {
  assert.equal(safeNext('/settings'), '/settings')
  assert.equal(safeNext('/accounts?x=1'), '/accounts?x=1')
})

test('refuses anything that could leave the site', () => {
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '', undefined, ['/x']]) {
    assert.equal(safeNext(bad), '/', String(bad))
  }
})
