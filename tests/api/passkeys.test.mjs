// Passkeys (pb_hooks/passkeys.pb.js, lib/webauthn.js), end to end through
// Nuxt against a real PocketBase with its hooks, with a test device signing
// as a phone or laptop would (tests/webauthn-device.mjs).

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { APP, PASSWORD, PB, asPb, client, ready } from './helpers.mjs'
import { device } from '../webauthn-device.mjs'

const url = new URL(APP)
const site = { origin: url.origin, rpId: url.hostname }

/** Adds a passkey for `c` from a new device: answers the device. */
async function addPasskey(c, name = 'Test phone') {
  const opts = await c.call('POST', '/api/passkeys/options', { password: PASSWORD })
  assert.equal(opts.status, 200, JSON.stringify(opts.json))
  const d = device(site)
  const r = await c.call('POST', '/api/passkeys', { challengeId: opts.json.challengeId, name, credential: d.create(opts.json.publicKey.challenge) })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return { d, passkey: r.json.passkey }
}

async function signIn(c, d, extra = {}) {
  const opts = await c.call('POST', '/api/auth/passkey/options', {})
  assert.equal(opts.status, 200, JSON.stringify(opts.json))
  const answer = d.get(opts.json.publicKey.challenge, extra.answer)
  return { opts: opts.json, answer, r: await c.call('POST', '/api/auth/passkey', { challengeId: opts.json.challengeId, credential: answer, ...(extra.mfaId ? { mfaId: extra.mfaId } : {}) }) }
}

describe('passkeys', () => {
  test('add one with the password, then sign in with it alone', async () => {
    const { c, address } = await ready()
    const wrong = await c.call('POST', '/api/passkeys/options', { password: 'not it at all' })
    assert.equal(wrong.status, 400)

    const opts = (await c.call('POST', '/api/passkeys/options', { password: PASSWORD })).json
    assert.equal(opts.publicKey.rp.id, site.rpId)
    assert.equal(opts.publicKey.authenticatorSelection.userVerification, 'required')
    const { d, passkey } = await addPasskey(c, '  My   phone ')
    assert.equal(passkey.name, 'My phone')
    const list = (await c.call('GET', '/api/passkeys')).json.passkeys
    assert.deepEqual(list.map(p => p.name), ['My phone'])
    const activity = (await c.call('GET', '/api/auth/activity')).json
    assert.ok(JSON.stringify(activity).includes('passkey_added'), JSON.stringify(activity))

    // A new device, nobody signed in: the passkey alone.
    const fresh = client()
    const { r, opts: signOpts, answer } = await signIn(fresh, d)
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.me.email, address)
    assert.equal((await fresh.call('GET', '/api/accounts')).status, 200, 'signed in, with a device session')

    // The same answer again: its challenge is used up.
    const again = await fresh.call('POST', '/api/auth/passkey', { challengeId: signOpts.challengeId, credential: answer })
    assert.equal(again.status, 400)
  })

  test('as the second step after the password, for the same account only', async () => {
    const { c, address } = await ready()
    const { c: other } = await ready()
    const { d } = await addPasskey(c)
    const { d: theirs } = await addPasskey(other)

    const second = client()
    const login = await second.call('POST', '/api/auth/login', { email: address, password: PASSWORD })
    const mfaId = login.json.twoStep.mfaId
    assert.ok(mfaId)
    assert.equal((await signIn(second, theirs, { mfaId })).r.status, 400, 'someone else\'s passkey')
    const ok = await signIn(second, d, { mfaId })
    assert.equal(ok.r.status, 200, JSON.stringify(ok.r.json))
    assert.equal(ok.r.json.me.email, address)
  })

  test('refused: a copied passkey, an unknown one, a removed one', async () => {
    const { c } = await ready()
    const { d, passkey } = await addPasskey(c)
    assert.equal((await signIn(client(), d)).r.status, 200)
    const copied = await signIn(client(), d, { answer: { same: true } })
    assert.equal(copied.r.status, 400, 'a counter that didn\'t move on')

    const stranger = device(site)
    stranger.create('x')
    assert.match((await signIn(client(), stranger)).r.json.message, /isn't one Cheddar knows/)

    const { c: someone } = await ready()
    assert.equal((await someone.call('POST', `/api/passkeys/${passkey.id}/remove`, {})).status, 404)
    assert.equal((await c.call('POST', `/api/passkeys/${passkey.id}/remove`, {})).status, 204)
    assert.deepEqual((await c.call('GET', '/api/passkeys')).json.passkeys, [])
    assert.equal((await signIn(client(), d)).r.status, 400)
  })

  test('only the hooks read or write them', async () => {
    const { c } = await ready()
    await addPasskey(c)
    for (const name of ['passkeys', 'passkey_challenges']) {
      const r = await fetch(`${PB}/api/collections/${name}/records`, { headers: asPb(c) })
      assert.equal(r.status, 403, name)
    }
    const finish = await fetch(`${PB}/api/collections/users/auth-with-passkey`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mfaId: 'aaaaaaaaaaaaaaa' }),
    })
    assert.equal(finish.status, 400)
  })
})
