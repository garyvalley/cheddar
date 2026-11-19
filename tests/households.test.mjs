// Unit tests for pb_hooks/lib/households.js: who may make, invite to,
// join, leave and share with a household. pb_hooks/households.pb.js applies
// them; tests/api/household.test.mjs covers the routes and record rules.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const h = loadHookModule('pb_hooks/lib/households.js')
const home = { id: 'h1', owner: 'ann', members: ['ann', 'bob'] }

test('a household needs a name of up to 60 characters, and one per person', () => {
  assert.deepEqual(h.newHousehold('  Home  ', false), { name: 'Home' })
  assert.equal(h.newHousehold('', false).status, 400)
  assert.equal(h.newHousehold('x'.repeat(61), false).status, 400)
  assert.match(h.newHousehold('Home', true).problem, /already belong/)
})

test('only the owner manages it, and a missing one is not found', () => {
  assert.equal(h.ownerOnly(home, 'ann'), null)
  assert.equal(h.ownerOnly(home, 'bob').status, 403)
  assert.equal(h.ownerOnly(null, 'ann').status, 404)
})

test('an invitation goes only to a verified account outside any household, once', () => {
  assert.deepEqual(h.inviteEmail(' Bob@Example.com '), { email: 'bob@example.com' })
  assert.equal(h.inviteEmail('').status, 400)
  const ok = { id: 'cat', verified: true, inHousehold: false }
  assert.equal(h.canInvite(ok, 'ann', false), null)
  assert.match(h.canInvite(ok, 'ann', true).problem, /already waiting/)
  // Each of these gets the same words, whether or not the address has an account.
  const same = [null, { ...ok, verified: false }, { ...ok, id: 'ann' }, { ...ok, inHousehold: true }].map(i => h.canInvite(i, 'ann', false).problem)
  assert.equal(new Set(same).size, 1)
})

test('accepting adds the person, up to 20, and not into a second household', () => {
  assert.deepEqual(h.accept(['ann'], 'cat', false), { members: ['ann', 'cat'] })
  assert.match(h.accept(['ann'], 'cat', true).problem, /already belong/)
  const full = Array.from({ length: h.MAX_MEMBERS }, (_, i) => `u${i}`)
  assert.match(h.accept(full, 'cat', false).problem, /member limit/)
  const members = ['ann']
  h.accept(members, 'cat', false)
  assert.deepEqual(members, ['ann'], 'the list given is left as it was')
})

test('the owner removes others, never themselves', () => {
  assert.deepEqual(h.removeMember(home, 'ann', 'bob'), { members: ['ann'] })
  assert.equal(h.removeMember(home, 'ann', 'ann').status, 400)
  assert.equal(h.removeMember(home, 'ann', 'cat').status, 404)
  assert.equal(h.removeMember(home, 'bob', 'ann').status, 403)
})

test('a member leaves; the owner closes it only once alone', () => {
  assert.deepEqual(h.leave(home, 'bob'), { members: ['ann'] })
  assert.match(h.leave(home, 'ann').problem, /Remove other members/)
  assert.deepEqual(h.leave({ ...home, members: ['ann'] }, 'ann'), { close: true })
  assert.equal(h.leave(null, 'ann').status, 404)
})

test('sharing an account needs a yes or no, and someone to share with', () => {
  assert.equal(h.share(true, 2), null)
  assert.equal(h.share(false, 1), null)
  assert.match(h.share(true, 1).problem, /Invite a household member/)
  assert.equal(h.share('yes', 2).status, 400)
})
