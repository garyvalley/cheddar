// Unit tests for pb_hooks/lib/notices.js: what the old address hears when an
// account's email changes (pb_hooks/credentials.pb.js sends them), and the
// two-step notices (lock, new app, new recovery codes).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const notices = loadHookModule('pb_hooks/lib/notices.js')

test('the asked-for notice names the new address and says how to stop it', () => {
  const { subject, html } = notices.emailChangeAsked('new@example.com')
  assert.match(subject, /being changed/)
  assert.match(html, /<strong>new@example\.com<\/strong>/)
  assert.match(html, /change your password now/)
})

test('the done notice names the new address', () => {
  const { subject, html } = notices.emailChanged('new@example.com')
  assert.match(subject, /was changed/)
  assert.match(html, /<strong>new@example\.com<\/strong>/)
})

test('an address is escaped, so it can never add markup', () => {
  const { html } = notices.emailChangeAsked('"><img src=x>@example.com')
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /&quot;&gt;&lt;img src=x&gt;@example\.com/)
})

// pb_hooks/two_step.pb.js sends these, to the account's own address.
test('a lock by wrong codes says how long and to change the password', () => {
  const { subject, html } = notices.codesLocked('30 minutes')
  assert.match(subject, /password/)
  assert.match(html, /locked for 30 minutes/)
  assert.match(html, /change your password now/)
})

test('a new app and new recovery codes each say what to do if it wasn\'t you', () => {
  for (const { subject, html } of [notices.appChanged(), notices.recoveryCodesNew()]) {
    assert.ok(subject.startsWith('A new') || subject.startsWith('New'), subject)
    assert.match(html, /If it wasn't, someone is signed in as you: change your password now/)
  }
})
