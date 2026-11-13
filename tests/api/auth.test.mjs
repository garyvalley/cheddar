// Accounts, sign-in, two-step sign-in and the guards around them, end to end
// through nginx and Nuxt against a real PocketBase.
//
// Needs the stack running (tests/README.md): PocketBase (PB_URL, superuser
// PB_SU_EMAIL / PB_SU_PASS, to clean up), Nuxt, and nginx in front of it
// (APP_URL) trusting any X-Forwarded-For, so each client signs in from a
// made-up address of its own and only the rate-limit tests reach a limit.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { APP, PB, PASSWORD, client, email, made, ready, signedIn, totp, withTwoStep } from './helpers.mjs'

describe('signing up', () => {
  test('refuses a short or common password, and a taken address', async () => {
    const c = client()
    const address = email()
    assert.match((await c.call('POST', '/api/auth/register', { email: address, password: 'short' })).json.message, /at least 12/)
    assert.match((await c.call('POST', '/api/auth/register', { email: address, password: 'password1234' })).json.message, /most common/)
    assert.equal((await c.call('POST', '/api/auth/register', { email: address, password: PASSWORD })).status, 201)
    made.push(address)
    const again = await c.call('POST', '/api/auth/register', { email: address, password: PASSWORD })
    assert.equal(again.status, 400)
    assert.match(again.json.message, /already has an account/)
  })
})

describe('signing in', () => {
  test('a right password sets an httpOnly cookie and never returns the token', async () => {
    const { c, address } = await signedIn()
    assert.ok(c.cookie.startsWith('pb_token='))
    const r = await c.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
    assert.ok(!JSON.stringify(r.json).includes(c.cookie.slice('pb_token='.length)), 'token in the body')
    const set = r.headers.getSetCookie().find(s => s.startsWith('pb_token='))
    assert.match(set, /HttpOnly/i)
    assert.match(set, /SameSite=Lax/i)
  })

  test('an unknown address and a wrong password get the same answer', async () => {
    const { address } = await signedIn()
    const c = client()
    const wrong = await c.call('POST', '/api/auth/login', { email: address, password: 'not the password' })
    const unknown = await c.call('POST', '/api/auth/login', { email: email(), password: 'not the password' })
    assert.equal(wrong.status, 400)
    assert.deepEqual([unknown.status, unknown.json.message], [wrong.status, wrong.json.message])
  })

  test('me answers the person with a cookie and null without', async () => {
    const { c, address } = await signedIn()
    assert.equal((await c.call('GET', '/api/auth/me')).json.me.email, address)
    assert.equal((await client().call('GET', '/api/auth/me')).json.me, null)
  })

  test('signing out forgets the cookie', async () => {
    const { c } = await signedIn()
    assert.equal((await c.call('POST', '/api/auth/logout')).status, 204)
    assert.equal(c.cookie, '')
  })

  test('a reset request answers the same for an unknown address', async () => {
    assert.equal((await client().call('POST', '/api/auth/request-password-reset', { email: email() })).status, 204)
  })
})

describe('the profile', () => {
  test('saves name, state and filing status', async () => {
    const { c } = await ready()
    const r = await c.call('PATCH', '/api/profile', { name: 'Pat', state: 'CA', filing_status: 'married_joint' })
    assert.equal(r.status, 200)
    assert.deepEqual([r.json.me.name, r.json.me.state, r.json.me.filing_status], ['Pat', 'CA', 'married_joint'])
    // Every state and DC is accepted.
    assert.equal((await c.call('PATCH', '/api/profile', { state: 'DC' })).json.me.state, 'DC')
    assert.equal((await c.call('PATCH', '/api/profile', { state: '' })).json.me.state, '')
  })

  test('saves the color theme and light or dark, and starts on the defaults', async () => {
    const { c } = await ready()
    const me = (await c.call('GET', '/api/auth/me')).json.me
    assert.deepEqual([me.theme, me.appearance], ['violet', 'system'])
    const r = await c.call('PATCH', '/api/profile', { theme: 'cheddar', appearance: 'dark' })
    assert.equal(r.status, 200)
    assert.deepEqual([r.json.me.theme, r.json.me.appearance], ['cheddar', 'dark'])
    const again = (await c.call('GET', '/api/auth/me')).json.me
    assert.deepEqual([again.theme, again.appearance], ['cheddar', 'dark'])
    assert.equal((await c.call('PATCH', '/api/profile', { theme: 'neon' })).status, 400)
    assert.equal((await c.call('PATCH', '/api/profile', { appearance: '' })).status, 400)
  })

  test('refuses a place that is not a state, and a made-up filing status', async () => {
    const { c } = await ready()
    assert.equal((await c.call('PATCH', '/api/profile', { state: 'ZZ' })).status, 400)
    assert.equal((await c.call('PATCH', '/api/profile', { state: 'ca' })).status, 400)
    assert.equal((await c.call('PATCH', '/api/profile', { filing_status: 'pirate' })).status, 400)
  })

  test('ignores fields that are not the profile\'s', async () => {
    const { c, address } = await ready()
    const r = await c.call('PATCH', '/api/profile', { name: 'X', email: 'other@cheddar.test', verified: true, mfa_enabled: true })
    assert.deepEqual([r.json.me.email, r.json.me.verified, r.json.me.mfa_enabled], [address, false, true])
  })

  test('stays closed until two-step sign-in is on', async () => {
    const { c } = await signedIn()
    const r = await c.call('PATCH', '/api/profile', { name: 'X', state: 'CA' })
    assert.equal(r.status, 404)
    assert.equal((await c.call('GET', '/api/auth/me')).json.me.state, '')
  })

  test('needs a session', async () => {
    assert.equal((await client().call('PATCH', '/api/profile', { name: 'X' })).status, 401)
  })
})

describe('guards', () => {
  test('a state-changing request from another site is refused', async () => {
    const { c } = await ready()
    const r = await c.call('PATCH', '/api/profile', { name: 'Evil' }, { origin: 'https://evil.example' })
    assert.equal(r.status, 403)
  })

  test('one person cannot read another through PocketBase with their own token', async () => {
    const a = await signedIn()
    const b = await signedIn()
    const token = b.c.cookie.slice('pb_token='.length)
    const list = await (await fetch(`${PB}/api/collections/users/records`, { headers: { authorization: token } })).json()
    assert.deepEqual(list.items.map(u => u.id), [b.id])
    const view = await fetch(`${PB}/api/collections/users/records/${a.id}`, { headers: { authorization: token } })
    assert.equal(view.status, 404)
    const del = await fetch(`${PB}/api/collections/users/records/${b.id}`, { method: 'DELETE', headers: { authorization: token } })
    assert.equal(del.status, 403, 'the record API cannot delete an account, not even one\'s own')
  })

  test('PocketBase refuses emailed sign-in codes outright', async () => {
    const { address } = await signedIn()
    const r = await fetch(`${PB}/api/collections/users/request-otp`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: address }),
    })
    assert.equal(r.status, 400)
  })

  test('a burst of sign-in tries from one address is refused, in the app\'s error shape', async () => {
    const c = client()
    const statuses = []
    for (let i = 0; i < 8; i++) statuses.push((await c.call('POST', '/api/auth/login', { email: email(), password: 'x' })).status)
    // nginx allows 1 at once plus a burst of 5, then 10 a minute.
    assert.deepEqual(statuses, [400, 400, 400, 400, 400, 400, 429, 429])
    const r = await c.call('POST', '/api/auth/login', { email: email(), password: 'x' })
    assert.match(r.json.message, /Too many tries/)
    assert.ok(Number(r.headers.get('retry-after')) > 0)
    // Another address is not held back.
    assert.equal((await client().call('POST', '/api/auth/login', { email: email(), password: 'x' })).status, 400)
  })

  test('reading two-step status as pages load never counts toward the limit', async () => {
    const { c } = await ready()
    for (let i = 0; i < 10; i++) assert.equal((await c.call('GET', '/api/auth/two-step')).status, 200)
    assert.equal((await c.call('POST', '/api/auth/two-step/recovery-codes', { password: PASSWORD })).status, 200)
  })

  test('requests that send mail have a tighter limit', async () => {
    const c = client()
    const statuses = []
    for (let i = 0; i < 6; i++) statuses.push((await c.call('POST', '/api/auth/request-password-reset', { email: email() })).status)
    assert.deepEqual(statuses, [204, 204, 204, 204, 429, 429])
  })

  test('visitors from a blocked country are refused, and others and the unplaced are not', async () => {
    for (const country of ['CN', 'RU', 'IN', 'KP', 'IR', 'BY']) {
      assert.equal((await client().call('GET', '/login', null, { 'cf-ipcountry': country })).status, 403, country)
    }
    assert.equal((await client().call('POST', '/api/auth/login', { email: email(), password: 'x' }, { 'cf-ipcountry': 'RU' })).status, 403)
    for (const country of ['US', 'CA', 'GB', 'XX']) {
      assert.equal((await client().call('GET', '/login', null, { 'cf-ipcountry': country })).status, 200, country)
    }
    assert.equal((await client().call('GET', '/login')).status, 200)
  })

  test('no response may be kept by Cloudflare', async () => {
    const r = await client().call('GET', '/login')
    assert.equal(r.headers.get('cloudflare-cdn-cache-control'), 'no-store')
    assert.equal(r.headers.get('server'), 'nginx', 'no version in the Server header')
  })

  test('pages carry the security headers', async () => {
    const r = await fetch(`${APP}/login`)
    const csp = r.headers.get('content-security-policy')
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /script-src [^;]*'nonce-/)
    assert.equal(r.headers.get('x-frame-options'), 'DENY')
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  })
})

describe('two-step sign-in', () => {
  test('setting it up needs the password and a right first code', async () => {
    const { c } = await signedIn()
    assert.equal((await c.call('POST', '/api/auth/two-step/app', { password: 'wrong password!' })).status, 400)
    const setup = await c.call('POST', '/api/auth/two-step/app', { password: PASSWORD })
    assert.match(setup.json.uri, /^otpauth:\/\/totp\/Cheddar:/)
    assert.equal((await c.call('POST', '/api/auth/two-step/app/confirm', { code: '000000' })).status, 400)
    assert.equal((await client().call('GET', '/api/auth/two-step', null, { cookie: c.cookie })).json.method, 'off')
  })

  test('once on, a password alone is not enough, and each code works once', async () => {
    const { c, address } = await signedIn()
    const { secret } = await withTwoStep(c)
    assert.equal((await c.call('GET', '/api/auth/two-step')).json.recovery_codes_left, 10)

    const other = client()
    const step1 = await other.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
    assert.ok(step1.json.twoStep.mfaId)
    assert.equal(other.cookie, '', 'no session before the code')
    assert.equal((await other.call('POST', '/api/auth/code', { mfaId: step1.json.twoStep.mfaId, code: '123456' })).status, 400)

    // The confirm step spent the current code; the next one is new.
    const code = totp.codeAt(secret, totp.stepAt(Date.now()) + 1)
    const ok = await other.call('POST', '/api/auth/code', { mfaId: step1.json.twoStep.mfaId, code })
    assert.equal(ok.status, 200)
    assert.ok(other.cookie.startsWith('pb_token='))

    const again = client()
    const s = await again.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
    assert.equal((await again.call('POST', '/api/auth/code', { mfaId: s.json.twoStep.mfaId, code })).status, 400, 'a code works once')
  })

  test('a recovery code signs in once, and says how many are left', async () => {
    const { c, address } = await signedIn()
    const { codes } = await withTwoStep(c)
    const use = async () => {
      const b = client()
      const s = await b.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
      return b.call('POST', '/api/auth/code', { mfaId: s.json.twoStep.mfaId, code: codes[0].toUpperCase() })
    }
    const first = await use()
    assert.equal(first.status, 200)
    assert.equal(first.json.recoveryCodesLeft, 9)
    assert.equal((await use()).status, 400)
  })

  test('a code needs a password step first', async () => {
    const { c } = await signedIn()
    const { secret } = await withTwoStep(c)
    const r = await client().call('POST', '/api/auth/code', { mfaId: 'madeupmfaid1234', code: totp.codeAt(secret, totp.stepAt(Date.now())) })
    assert.equal(r.status, 400)
  })

  test('five wrong codes lock the codes', async () => {
    const { address } = await ready()
    let last
    for (let i = 0; i < 5; i++) {
      // From a new address each time, so it is the lock that answers, not nginx's limit.
      const b = client()
      const s = await b.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
      last = await b.call('POST', '/api/auth/code', { mfaId: s.json.twoStep.mfaId, code: '000000' })
    }
    assert.equal(last.status, 429)
  })

  test('once on, it cannot be switched off', async () => {
    const { c, id } = await ready()
    assert.equal((await c.call('POST', '/api/auth/two-step/off', { password: PASSWORD })).status, 404)
    const token = c.cookie.slice('pb_token='.length)
    await fetch(`${PB}/api/collections/users/records/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', 'authorization': token }, body: JSON.stringify({ mfa_enabled: false }),
    })
    assert.equal((await client().call('GET', '/api/auth/me', null, { cookie: c.cookie })).json.me.mfa_enabled, true)
  })

  test('a new account may still set it up, sign out and delete itself', async () => {
    const { c } = await signedIn()
    assert.equal((await c.call('GET', '/api/auth/me')).json.me.mfa_enabled, false)
    const { secret } = await withTwoStep(c)
    assert.ok(secret)
    assert.equal((await client().call('POST', '/api/auth/logout', null, { cookie: c.cookie })).status, 204)
    const other = await signedIn()
    assert.equal((await other.c.call('POST', '/api/auth/delete-account', { password: PASSWORD })).status, 204)
  })
})

describe('sessions and deletion', () => {
  test('signing out everywhere ends every session', async () => {
    const { c, address } = await signedIn()
    const other = client()
    await other.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
    assert.equal((await c.call('POST', '/api/auth/logout-everywhere')).status, 204)
    assert.equal((await other.call('GET', '/api/auth/me')).json.me, null)
  })

  test('deleting needs the password, and then the account is gone', async () => {
    const { c, address } = await signedIn()
    assert.equal((await c.call('POST', '/api/auth/delete-account', { password: 'wrong password!' })).status, 400)
    assert.equal((await c.call('POST', '/api/auth/delete-account', { password: PASSWORD })).status, 204)
    assert.equal(c.cookie, '')
    assert.equal((await client().call('POST', '/api/auth/login', { email: address, password: PASSWORD })).status, 400)
  })
})

describe('changing the password and email', () => {
  test('a new password needs the current one and a strong one, and ends every other session', async () => {
    const { c, address, secret } = await ready()
    const other = client()
    const step = await other.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
    // The confirm step spent the current code; the next one is new.
    const code = totp.codeAt(secret, totp.stepAt(Date.now()) + 1)
    assert.equal((await other.call('POST', '/api/auth/code', { mfaId: step.json.twoStep.mfaId, code })).status, 200)
    const NEW = 'a brand new passphrase'
    // Each try from an address of its own, so it is the route that answers, not the sign-in limit.
    const change = async (body) => {
      const from = client()
      from.cookie = c.cookie
      const r = await from.call('POST', '/api/auth/change-password', body)
      c.cookie = from.cookie
      return r
    }

    assert.equal((await change({ password: 'wrong password!', newPassword: NEW })).status, 400)
    assert.equal((await change({ password: PASSWORD, newPassword: 'short' })).status, 400)
    assert.equal((await change({ password: PASSWORD, newPassword: 'password1234' })).status, 400)
    assert.notEqual((await other.call('GET', '/api/auth/me')).json.me, null, 'a refused change ends nothing')

    const before = c.cookie
    assert.equal((await change({ password: PASSWORD, newPassword: NEW })).status, 204)
    assert.notEqual(c.cookie, before, 'this session gets a fresh token')
    const me = (await c.call('GET', '/api/auth/me')).json.me
    assert.equal(me.email, address, 'and stays signed in')
    assert.equal(me.mfa_enabled, true)
    assert.equal((await c.call('GET', '/api/auth/two-step')).status, 200)
    assert.equal((await other.call('GET', '/api/auth/me')).json.me, null, 'every other session ends')

    assert.equal((await client().call('POST', '/api/auth/login', { email: address, password: PASSWORD })).status, 400)
    assert.ok((await client().call('POST', '/api/auth/login', { email: address, password: NEW })).json.twoStep.mfaId)
  })

  test('both wait for two-step sign-in', async () => {
    const { c } = await signedIn()
    assert.equal((await c.call('POST', '/api/auth/change-password', { password: PASSWORD, newPassword: 'a brand new passphrase' })).status, 403)
    assert.equal((await c.call('POST', '/api/auth/request-email-change', { password: PASSWORD, email: email() })).status, 403)
  })

  test('an email change needs the password and a free, valid address, and changes nothing until confirmed', async () => {
    const { c, address } = await ready()
    const taken = await signedIn()
    const to = email()
    made.push(to)
    // Each try from an address of its own, so it is the route that answers, not the mail limit.
    const ask = body => client().call('POST', '/api/auth/request-email-change', body, { cookie: c.cookie })
    assert.equal((await ask({ password: 'wrong password!', email: to })).status, 400)
    assert.equal((await ask({ password: PASSWORD, email: 'not an address' })).status, 400)
    assert.equal((await ask({ password: PASSWORD, email: taken.address })).status, 400)
    assert.equal((await ask({ password: PASSWORD, email: address })).status, 400)
    assert.equal((await ask({ password: PASSWORD, email: to })).status, 204)
    assert.equal((await c.call('GET', '/api/auth/me')).json.me.email, address)
  })

  test('PocketBase\'s own email-change request, which skips the password, is refused', async () => {
    const { c } = await ready()
    const r = await fetch(`${PB}/api/collections/users/request-email-change`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': c.cookie.slice('pb_token='.length) },
      body: JSON.stringify({ newEmail: email() }),
    })
    assert.equal(r.status, 400)
  })

  test('the record API cannot set a password, even with the old one', async () => {
    const { c, id, address } = await ready()
    const r = await fetch(`${PB}/api/collections/users/records/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'authorization': c.cookie.slice('pb_token='.length) },
      body: JSON.stringify({ oldPassword: PASSWORD, password: 'password1234', passwordConfirm: 'password1234' }),
    })
    assert.equal(r.status, 400)
    assert.ok((await client().call('POST', '/api/auth/login', { email: address, password: PASSWORD })).json.twoStep.mfaId)
  })

  test('a made-up confirm token changes nothing', async () => {
    const r = await client().call('POST', '/api/auth/confirm-email-change', { token: 'made.up.token', password: PASSWORD })
    assert.equal(r.status, 400)
  })

  test('each needs a session', async () => {
    assert.equal((await client().call('POST', '/api/auth/change-password', { password: PASSWORD, newPassword: 'whatever passphrase' })).status, 401)
    assert.equal((await client().call('POST', '/api/auth/request-email-change', { password: PASSWORD, email: email() })).status, 401)
  })
})
