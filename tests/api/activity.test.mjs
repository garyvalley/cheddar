// Recent activity (security_events, pb_hooks/glue/events.js), end to end:
// sign-ins and security changes are recorded with the device, each person
// sees only their own, and nobody writes them through the record API.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORD, PB, asPb, client, ready, totp } from './helpers.mjs'

const kinds = async c => (await c.call('GET', '/api/auth/activity')).json.activity.map(e => e.kind)

describe('recent activity', () => {
  test('records sign-ins, wrong codes and two-step changes, newest first, with the device', async () => {
    const { c, address, secret } = await ready()
    const b = client()
    const phone = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0', 'cf-ipcountry': 'DE' }
    let s = await b.call('POST', '/api/auth/login', { email: address, password: PASSWORD }, phone)
    assert.equal((await b.call('POST', '/api/auth/code', { mfaId: s.json.twoStep.mfaId, code: '000000' }, phone)).status, 400)
    s = await b.call('POST', '/api/auth/login', { email: address, password: PASSWORD }, phone)
    assert.equal((await b.call('POST', '/api/auth/code', { mfaId: s.json.twoStep.mfaId, code: totp.codeAt(secret, totp.stepAt(Date.now()) + 1) }, phone)).status, 200)
    assert.equal((await c.call('POST', '/api/auth/two-step/recovery-codes', { password: PASSWORD })).status, 200)

    const list = (await c.call('GET', '/api/auth/activity')).json.activity
    assert.deepEqual(list.map(e => e.kind), ['recovery_codes_new', 'sign_in', 'code_wrong', 'two_step_changed', 'sign_in'])
    assert.deepEqual([list[1].device, list[1].place], ['Firefox on Windows', 'DE'])
    assert.deepEqual([list[2].device, list[2].place], ['Firefox on Windows', 'DE'])
  })

  test('records a new password and an export', async () => {
    const { c } = await ready()
    await c.call('POST', '/api/export', { password: PASSWORD })
    await c.call('POST', '/api/auth/change-password', { password: PASSWORD, newPassword: 'another long passphrase' })
    const got = await kinds(c)
    assert.deepEqual(got.slice(0, 2), ['password_changed', 'export'])
  })

  test("shows nobody else's, and the record API writes none", async () => {
    const owner = await ready()
    const other = await ready()
    const mine = (await other.c.call('GET', '/api/auth/activity')).json.activity
    assert.deepEqual(mine.map(e => e.kind), ['two_step_changed', 'sign_in'])
    const direct = await fetch(`${PB}/api/collections/security_events/records`, { headers: asPb(other.c) })
    assert.equal(direct.status, 200)
    assert.equal((await direct.json()).items.length, 2)
    const made = await fetch(`${PB}/api/collections/security_events/records`, {
      method: 'POST', headers: { ...asPb(owner.c), 'content-type': 'application/json' }, body: JSON.stringify({ user: other.id, kind: 'sign_in' }),
    })
    assert.ok([400, 403].includes(made.status), String(made.status))
  })
})
