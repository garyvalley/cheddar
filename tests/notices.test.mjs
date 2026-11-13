// Unit tests for pb_hooks/lib/notices.js: what the old address hears when an
// account's email changes (pb_hooks/credentials.pb.js sends them).

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
