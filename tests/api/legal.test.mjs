// The Terms of Use and the contact form, end to end through nginx and Nuxt
// against a real PocketBase: sign-up must agree to the terms in force, only
// the hooks stamp when, and contact messages are kept where only a superuser
// reads them. Needs the stack running (tests/README.md).

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from '../load-hook-module.mjs'
import { asPb, APP, PB, PASSWORD, client, email, ready, superuser } from './helpers.mjs'

const { TERMS_VERSION } = loadHookModule('pb_hooks/lib/gen/legal.js')

describe('agreeing to the terms', () => {
  test('sign-up needs the box ticked', async () => {
    const r = await client().call('POST', '/api/auth/register', { email: email(), password: PASSWORD })
    assert.equal(r.status, 400)
    assert.match(r.json.message, /Agree to the Terms of Use/)
  })

  test('a new account has agreed to the version in force, stamped by the server', async () => {
    const { c, id } = await ready()
    const me = (await c.call('GET', '/api/auth/me')).json.me
    assert.equal(me.terms_version, TERMS_VERSION)
    const row = await (await fetch(`${PB}/api/collections/users/records/${id}`, { headers: { authorization: await superuser() } })).json()
    assert.ok(Math.abs(row.terms_agreed - Date.now()) < 5 * 60 * 1000, 'terms_agreed is now')
  })

  test('PocketBase refuses an account made without the terms, or with another version', async () => {
    for (const terms_version of [undefined, '2000-01-01']) {
      const address = email()
      const r = await fetch(`${PB}/api/collections/users/records`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address, password: PASSWORD, passwordConfirm: PASSWORD, terms_version }),
      })
      assert.equal(r.status, 400, `made an account with terms_version ${terms_version}`)
    }
  })

  test('the record API can only move to the version in force, and never sets the time', async () => {
    const { c, id } = await ready()
    const su = { authorization: await superuser() }
    const before = (await (await fetch(`${PB}/api/collections/users/records/${id}`, { headers: su })).json()).terms_agreed
    const patch = body => fetch(`${PB}/api/collections/users/records/${id}`, {
      method: 'PATCH', headers: { ...asPb(c), 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    assert.equal((await patch({ terms_version: '2000-01-01' })).status, 400)
    assert.equal((await patch({ terms_agreed: 1 })).status, 200)
    const after = (await (await fetch(`${PB}/api/collections/users/records/${id}`, { headers: su })).json())
    assert.equal(after.terms_version, TERMS_VERSION)
    assert.equal(after.terms_agreed, before)
  })

  test('someone on an older version agrees again through /api/auth/agree', async () => {
    const { c, id } = await ready()
    const su = { 'authorization': await superuser(), 'content-type': 'application/json' }
    await fetch(`${PB}/api/collections/users/records/${id}`, { method: 'PATCH', headers: su, body: JSON.stringify({ terms_version: '' }) })
    assert.equal((await c.call('GET', '/api/auth/me')).json.me.terms_version, '')
    const r = await c.call('POST', '/api/auth/agree')
    assert.equal(r.status, 200)
    assert.equal(r.json.me.terms_version, TERMS_VERSION)
  })

  test('agreeing needs a session', async () => {
    assert.equal((await client().call('POST', '/api/auth/agree')).status, 401)
  })
})

describe('the contact form', () => {
  const find = async (address) => {
    const r = await fetch(`${PB}/api/collections/contact_messages/records?filter=${encodeURIComponent(`email = '${address}'`)}`, { headers: { authorization: await superuser() } })
    return (await r.json()).items
  }

  test('keeps a message from someone signed out, for a superuser to read', async () => {
    const address = email()
    const r = await client().call('POST', '/api/contact', { name: 'Sam', email: address, topic: 'privacy', message: 'Hello\nthere' })
    assert.equal(r.status, 204)
    const [row] = await find(address)
    assert.equal(row.topic, 'privacy')
    assert.equal(row.message, 'Hello\nthere')
    assert.equal(row.user, '')
  })

  test('notes the account when signed in', async () => {
    const { c, id } = await ready()
    const address = email()
    assert.equal((await c.call('POST', '/api/contact', { email: address, topic: 'question', message: 'Hi' })).status, 204)
    assert.equal((await find(address))[0].user, id)
  })

  test('refuses a bad message, and quietly drops a bot', async () => {
    // A client each: the form shares nginx's tight mail limit.
    for (const body of [
      { email: 'not an address', topic: 'question', message: 'Hi' },
      { email: email(), topic: 'lunch', message: 'Hi' },
      { email: email(), topic: 'question', message: '   ' },
      { email: email(), topic: 'question', message: 'x'.repeat(5001) },
    ]) assert.equal((await client().call('POST', '/api/contact', body)).status, 400, JSON.stringify(body).slice(0, 80))
    const bot = email()
    assert.equal((await client().call('POST', '/api/contact', { email: bot, topic: 'question', message: 'Buy', website: 'spam.example' })).status, 204)
    assert.equal((await find(bot)).length, 0)
  })

  test('nobody but a superuser can read or write the messages', async () => {
    const { c } = await ready()
    const list = await fetch(`${PB}/api/collections/contact_messages/records`, { headers: asPb(c) })
    assert.ok(list.status === 403 || (list.status === 200 && (await list.json()).items.length === 0))
    const write = await fetch(`${PB}/api/collections/contact_messages/records`, {
      method: 'POST', headers: { ...asPb(c), 'content-type': 'application/json' },
      body: JSON.stringify({ email: email(), topic: 'question', message: 'Hi' }),
    })
    assert.ok(write.status >= 400)
  })
})

describe('public pages', () => {
  test('security.txt points at the contact form', async () => {
    const r = await fetch(`${APP}/.well-known/security.txt`)
    assert.equal(r.status, 200)
    const text = await r.text()
    assert.match(text, /^Contact: .+\/contact\?topic=security$/m)
    const expires = new Date(text.match(/^Expires: (.+)$/m)[1])
    assert.ok(expires > new Date(Date.now() + 300 * 24 * 60 * 60 * 1000))
  })

  test('terms, privacy and contact open signed out, each with the footer', async () => {
    for (const path of ['/terms', '/privacy', '/contact', '/login']) {
      const r = await fetch(`${APP}${path}`)
      assert.equal(r.status, 200, path)
      const html = await r.text()
      for (const link of ['/privacy', '/terms', '/contact']) assert.ok(html.includes(`href="${link}"`), `${path} links ${link}`)
    }
  })
})
