// What every API suite shares: a browser-like client, fresh accounts (with
// and without two-step sign-in), and the superuser that deletes them after.
// tests/README.md says what the suites need running.

import { after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { loadHookModule } from '../load-hook-module.mjs'
export const APP = (process.env.APP_URL || 'http://localhost:8085').replace(/\/$/, '')
export const PB = (process.env.PB_URL || 'http://127.0.0.1:8095').replace(/\/$/, '')
export const totp = loadHookModule('pb_hooks/lib/totp.js')
export const PASSWORD = 'correct horse battery'
export const made = []

export const ip = () => `10.${[1, 2, 3].map(() => randomBytes(1)[0]).join('.')}`
export const email = () => `t-${randomBytes(6).toString('hex')}@cheddar.test`

/** A browser: keeps the session cookie and sends this site's Origin, from one address. */
// The cookies a sign-in sets: the token, and the device session PocketBase
// wants beside it (pb_hooks/sessions.pb.js).
const COOKIES = ['pb_token', 'cheddar_sid']

export function client(from = ip()) {
  const jar = new Map()
  return {
    from,
    /** The Cookie header this browser sends: "pb_token=…; cheddar_sid=…", or "". */
    get cookie() { return COOKIES.filter(n => jar.has(n)).map(n => `${n}=${jar.get(n)}`).join('; ') },
    set cookie(v) {
      jar.clear()
      for (const part of String(v || '').split(/;\s*/)) {
        const at = part.indexOf('=')
        if (at > 0 && COOKIES.includes(part.slice(0, at))) jar.set(part.slice(0, at), part.slice(at + 1))
      }
    },
    /** The PocketBase token alone, and its device session's id. */
    get token() { return decodeURIComponent(jar.get('pb_token') || '') },
    get sid() { return decodeURIComponent(jar.get('cheddar_sid') || '') },
    async call(method, path, body, headers = {}) {
      const cookie = this.cookie
      const r = await fetch(`${APP}${path}`, {
        method,
        headers: {
          'origin': APP, 'x-forwarded-for': from,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      })
      for (const set of r.headers.getSetCookie()) {
        const name = set.slice(0, set.indexOf('='))
        if (!COOKIES.includes(name)) continue
        if (new RegExp(`^${name}=;|Max-Age=0`, 'i').test(set)) jar.delete(name)
        else jar.set(name, set.split(';')[0].slice(name.length + 1))
      }
      const text = await r.text()
      let json
      try { json = text ? JSON.parse(text) : null } catch { json = text }
      return { status: r.status, json, headers: r.headers }
    },
  }
}

/** Headers that call PocketBase directly as `c`: its token, and its device session. */
export const asPb = c => ({ authorization: c.token, 'x-cheddar-session': c.sid })

export async function superuser() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: process.env.PB_SU_EMAIL, password: process.env.PB_SU_PASS }),
  })
  assert.equal(r.status, 200, 'superuser sign-in (PB_SU_EMAIL / PB_SU_PASS)')
  return (await r.json()).token
}

/** A new account, signed in with its password only: two-step sign-in is not on yet. */
export async function signedIn() {
  const c = client()
  const address = email()
  assert.equal((await c.call('POST', '/api/auth/register', { email: address, password: PASSWORD, name: 'Test' })).status, 201)
  made.push(address)
  const r = await c.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
  assert.equal(r.status, 200)
  return { c, address, id: r.json.me.id }
}

/** Two-step sign-in on for `c`; returns the secret and the recovery codes. */
export async function withTwoStep(c) {
  const { json: { secret } } = await c.call('POST', '/api/auth/two-step/app', { password: PASSWORD })
  const r = await c.call('POST', '/api/auth/two-step/app/confirm', { code: totp.codeAt(secret, totp.stepAt(Date.now())) })
  assert.equal(r.status, 200)
  return { secret, codes: r.json.recovery_codes }
}

/** A new account with two-step sign-in on, as every account that uses the app has. */
export async function ready() {
  const account = await signedIn()
  return { ...account, ...(await withTwoStep(account.c)) }
}

// Every account a suite made goes when it ends.
after(async () => {
  const token = await superuser()
  for (const address of made) {
    const r = await fetch(`${PB}/api/collections/users/records?filter=${encodeURIComponent(`email='${address}'`)}`, { headers: { authorization: token } })
    for (const u of (await r.json()).items) {
      await fetch(`${PB}/api/collections/users/records/${u.id}`, { method: 'DELETE', headers: { authorization: token } })
    }
  }
})
