// Unit tests for pb_hooks/lib/signup.js: who may make an account.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'
import { SIGN_UP_MODES, asSignUpMode } from '../shared/sign-up.ts'

const signup = loadHookModule('pb_hooks/lib/signup.js')
const env = vars => k => vars[k] ?? ''

describe('sign-up', () => {
  test('is open unless SIGNUP says otherwise', () => {
    assert.equal(signup.config(env({})).mode, 'open')
    assert.equal(signup.allows(signup.config(env({})), 'anyone@example.com'), true)
    assert.equal(signup.config(env({ SIGNUP: ' Closed ' })).mode, 'closed')
    assert.equal(signup.allows(signup.config(env({ SIGNUP: 'closed', SIGNUP_ALLOW: 'me@x.com' })), 'me@x.com'), false)
  })

  test('a word it doesn\'t know counts as invite, so a typo never opens it to everyone', () => {
    assert.equal(signup.config(env({ SIGNUP: 'invte' })).mode, 'invite')
  })

  test('invite lets in whole addresses and everyone at an @domain, ignoring case', () => {
    const cfg = signup.config(env({ SIGNUP: 'invite', SIGNUP_ALLOW: ' Me@X.com,@Family.org ; other@y.net junk' }))
    assert.deepEqual(cfg.allow, ['me@x.com', '@family.org', 'other@y.net'])
    assert.equal(signup.allows(cfg, 'ME@x.com'), true)
    assert.equal(signup.allows(cfg, 'aunt@family.org'), true)
    assert.equal(signup.allows(cfg, 'other@y.net'), true)
    assert.equal(signup.allows(cfg, 'me@x.com.evil.org'), false)
    assert.equal(signup.allows(cfg, 'aunt@notfamily.org'), false)
    assert.equal(signup.allows(cfg, 'someone@sub.family.org'), false)
    assert.equal(signup.allows(cfg, ''), false)
    assert.equal(signup.allows(cfg, '@family.org'), false)
  })

  test('invite with an empty list lets nobody in', () => {
    assert.equal(signup.allows(signup.config(env({ SIGNUP: 'invite' })), 'me@x.com'), false)
  })

  test('says why an address was turned away', () => {
    assert.match(signup.refusal(signup.config(env({ SIGNUP: 'invite' }))), /invite-only/)
    assert.match(signup.refusal(signup.config(env({ SIGNUP: 'closed' }))), /isn't taking new accounts/)
  })

  test('the browser knows the same modes', () => {
    assert.deepEqual([...SIGN_UP_MODES], signup.MODES)
    assert.equal(asSignUpMode('invite'), 'invite')
    assert.equal(asSignUpMode('nonsense'), 'open')
  })
})
