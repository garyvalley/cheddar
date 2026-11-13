// Unit tests for pb_hooks/lib/sessions.js: how long a device stays signed
// in, when a bank step wants the password again, and how a device is named.
// pb_hooks/sessions.pb.js applies them; tests/api/sessions.test.mjs covers the routes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const s = loadHookModule('pb_hooks/lib/sessions.js')
const NOW = Date.parse('2026-11-13T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const MIN = 60 * 1000

test('a session lasts 30 days from its sign-in, however often it is used', () => {
  assert.equal(s.isExpired(NOW - 29 * DAY, NOW), false)
  assert.equal(s.isExpired(NOW - 30 * DAY, NOW), true)
  assert.equal(s.isExpired(0, NOW), true)
})

test('linking or unlinking a bank wants a password typed in the last 15 minutes', () => {
  assert.equal(s.needsPassword(NOW - 14 * MIN, NOW), false)
  assert.equal(s.needsPassword(NOW - 15 * MIN, NOW), true)
  assert.equal(s.needsPassword(0, NOW), true)
})

test('last used is saved at most every 5 minutes', () => {
  assert.equal(s.shouldTouch(NOW - 4 * MIN, NOW), false)
  assert.equal(s.shouldTouch(NOW - 5 * MIN, NOW), true)
})

test('a row goes once past its 30 days, or unused longer than a token lasts', () => {
  assert.equal(s.isStale(NOW - 10 * DAY, NOW - 1 * DAY, NOW), false)
  assert.equal(s.isStale(NOW - 10 * DAY, NOW - 3 * DAY, NOW), true)
  assert.equal(s.isStale(NOW - 31 * DAY, NOW, NOW), true)
})

test('a device is named by its browser and system', () => {
  const ua = {
    'Safari on iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    'Chrome on iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
    'Chrome on Mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Safari on Mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    'Edge on Windows': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Firefox on Linux': 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Chrome on Android': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'A browser': 'node',
  }
  for (const [label, text] of Object.entries(ua)) assert.equal(s.deviceLabel(text), label, text)
  assert.equal(s.deviceLabel(''), 'A browser')
})

test("the place is a country code, or nothing when Cloudflare doesn't know", () => {
  assert.equal(s.place('us'), 'US')
  for (const none of ['', 'XX', 'T1', 'USA', null]) assert.equal(s.place(none), '', String(none))
})

test('a session id from a header is 40 letters and digits', () => {
  assert.equal(s.isSessionId('a'.repeat(40)), true)
  for (const bad of ['', 'a'.repeat(39), 'a'.repeat(41), `${'a'.repeat(39)}-`, null]) assert.equal(s.isSessionId(bad), false, String(bad))
})
