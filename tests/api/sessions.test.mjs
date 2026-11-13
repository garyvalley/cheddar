// Signed-in devices (pb_hooks/sessions.pb.js), end to end: each sign-in is a
// device, a token counts only beside its device's session, signing out one
// device ends it for real, and a session lasts at most 30 days.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORD, PB, asPb, client, ready, superuser, totp } from './helpers.mjs'

/** The person's session rows, as a superuser sees them (no rule opens them to anyone else). */
async function rows(userId) {
  const r = await fetch(`${PB}/api/collections/sessions/records?filter=${encodeURIComponent(`user='${userId}'`)}`, { headers: { authorization: await superuser() } })
  return (await r.json()).items
}

/** A second sign-in for the same person, from a browser of its own. */
async function secondDevice(address, secret, ahead = 1) {
  const b = client()
  const phone = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'cf-ipcountry': 'CA' }
  const s = await b.call('POST', '/api/auth/login', { email: address, password: PASSWORD }, phone)
  const r = await b.call('POST', '/api/auth/code', { mfaId: s.json.twoStep.mfaId, code: totp.codeAt(secret, totp.stepAt(Date.now()) + ahead) }, phone)
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return b
}

const me = async c => (await client().call('GET', '/api/auth/me', null, { cookie: c.cookie })).json.me

describe('devices', () => {
  test('each sign-in is a device, listed with this one marked', async () => {
    const { c, address, secret } = await ready()
    await secondDevice(address, secret)
    const list = (await c.call('GET', '/api/auth/sessions')).json.sessions
    assert.equal(list.length, 2)
    assert.equal(list.filter(s => s.current).length, 1)
    const phone = list.find(s => !s.current)
    assert.deepEqual([phone.device, phone.place], ['Safari on iPhone', 'CA'])
    assert.ok(!JSON.stringify(list).includes('sid'), 'never the id or its hash')
  })

  test('signing out ends the device for real, even with a copy of its cookies', async () => {
    const { c } = await ready()
    const copy = client()
    copy.cookie = c.cookie
    assert.equal((await c.call('POST', '/api/auth/logout')).status, 204)
    assert.equal(c.cookie, '')
    assert.equal(await me(copy), null)
  })

  test('one device can sign another out, and itself keeps going', async () => {
    const { c, address, secret } = await ready()
    const phone = await secondDevice(address, secret)
    const other = (await c.call('GET', '/api/auth/sessions')).json.sessions.find(s => !s.current)
    assert.equal((await c.call('POST', `/api/auth/sessions/${other.id}/end`)).status, 204)
    assert.equal(await me(phone), null)
    assert.ok(await me(c))
  })

  test("nobody signs out another person's device", async () => {
    const owner = await ready()
    const stranger = await ready()
    const theirs = (await owner.c.call('GET', '/api/auth/sessions')).json.sessions[0]
    assert.equal((await stranger.c.call('POST', `/api/auth/sessions/${theirs.id}/end`)).status, 204)
    assert.ok(await me(owner.c))
  })

  test('a token counts only beside its session, and no record rule opens the rows', async () => {
    const { c, id } = await ready()
    const tokenOnly = await fetch(`${PB}/api/collections/accounts/records`, { headers: { authorization: c.token } })
    assert.equal(tokenOnly.status, 401)
    const both = await fetch(`${PB}/api/collections/accounts/records`, { headers: asPb(c) })
    assert.equal(both.status, 200)
    const tokenCookie = client()
    tokenCookie.cookie = c.cookie.split('; ').find(p => p.startsWith('pb_token='))
    assert.equal(await me(tokenCookie), null)
    const own = await fetch(`${PB}/api/collections/sessions/records?filter=${encodeURIComponent(`user='${id}'`)}`, { headers: asPb(c) })
    assert.ok([403, 200].includes(own.status))
    if (own.status === 200) assert.equal((await own.json()).items.length, 0)
  })

  test('a session needs a full sign-in again 30 days after its last one', async () => {
    const { c, id } = await ready()
    const [row] = await rows(id)
    await fetch(`${PB}/api/collections/sessions/records/${row.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', authorization: await superuser() },
      body: JSON.stringify({ signed_in: Date.now() - 31 * 24 * 60 * 60 * 1000 }),
    })
    assert.equal(await me(c), null)
    assert.equal((await rows(id)).length, 0, 'the row goes')
  })

  test('a new password keeps this device and signs out the rest', async () => {
    const { c, address, secret } = await ready()
    const phone = await secondDevice(address, secret)
    const r = await c.call('POST', '/api/auth/change-password', { password: PASSWORD, newPassword: 'another long passphrase' })
    assert.equal(r.status, 204, JSON.stringify(r.json))
    assert.ok(await me(c))
    assert.equal(await me(phone), null)
    assert.equal((await c.call('GET', '/api/auth/sessions')).json.sessions.length, 1)
  })

  test('sign out everywhere ends every device', async () => {
    const { c, id, address, secret } = await ready()
    const phone = await secondDevice(address, secret)
    assert.equal((await c.call('POST', '/api/auth/logout-everywhere')).status, 204)
    assert.equal(await me(phone), null)
    assert.equal((await rows(id)).length, 0)
  })
})
