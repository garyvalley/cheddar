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

// pb_hooks/contact.pb.js sends this one to CONTACT_TO, whoever runs Cheddar.
test('a contact message is escaped, keeps its lines, and says whether it was signed in', () => {
  const msg = { name: '<b>Sam</b>', email: 'sam@example.com', topic: 'security', message: 'Line one\n<script>x</script>' }
  const out = notices.contactMessage(msg, 'A security problem', '')
  assert.match(out.subject, /A security problem/)
  assert.doesNotMatch(out.html, /<script>|<b>Sam/)
  assert.match(out.html, /Line one<br>&lt;script&gt;/)
  assert.match(out.html, /not signed in/)
  assert.match(notices.contactMessage(msg, 'A security problem', 'acct@example.com').html, /signed in to Cheddar as acct@example\.com/)
})

// Issue #122: a changed password, a new device, a new bank, a deleted account.
test('a changed password, a new bank and a new device each say what to do if it wasn\'t you', () => {
  const all = [notices.passwordChanged(), notices.bankLinked('Chase'), notices.newDevice({ device: 'Safari on iPhone', place: 'US' })]
  for (const { subject, html } of all) {
    assert.ok(subject.length > 10, subject)
    assert.match(html, /If this was you, there's nothing to do\./)
    assert.match(html, /If it wasn't, someone (is signed in as you|has your password)/)
  }
  assert.match(all[1].html, /<strong>Chase<\/strong> was just linked/)
  assert.match(all[2].html, /<strong>Safari on iPhone<\/strong> in US/)
})

test('a new device without a place, or a bank without a name, still reads', () => {
  assert.match(notices.newDevice({ device: '', place: '' }).html, /from <strong>A browser<\/strong>\./)
  assert.match(notices.bankLinked('').html, /A bank was just linked/)
})

test('the device and bank names are escaped', () => {
  assert.doesNotMatch(notices.newDevice({ device: '<img src=x>', place: '' }).html, /<img/)
  assert.doesNotMatch(notices.bankLinked('<b>Bank</b>').html, /<b>Bank/)
})

test('the deleted-account notice says it is done and no more mail comes', () => {
  const { subject, html } = notices.accountDeleted()
  assert.match(subject, /deleted/)
  assert.match(html, /no more mail/)
})
