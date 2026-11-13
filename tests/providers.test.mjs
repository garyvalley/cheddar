// Bank-link providers (pb_hooks/glue/providers.js, issue #36): each one
// answers the whole contract the links' glue calls, so another provider
// can sit beside Plaid without touching the routes or the sync.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const providers = loadHookModule('pb_hooks/glue/providers.js')
const CONTRACT = ['enabled', 'limits', 'linkToken', 'exchange', 'accounts', 'changes', 'remove', 'clean', 'webhookUrl', 'setWebhook', 'webhookKey', 'webhookEvent']

test('every provider answers the whole contract, under the name links store', () => {
  assert.ok(Object.keys(providers.ALL).length > 0)
  for (const [name, p] of Object.entries(providers.ALL)) {
    assert.equal(p.name, name)
    for (const fn of CONTRACT) assert.equal(typeof p[fn], 'function', `${name}.${fn}`)
    assert.ok(p.MIN_SYNC_GAP_MS > 0, `${name}.MIN_SYNC_GAP_MS`)
  }
})

test('a link names its provider; one from before that is Plaid\'s, and an unknown one is refused', () => {
  assert.equal(providers.of('plaid').name, 'plaid')
  assert.equal(providers.of('').name, providers.DEFAULT)
  assert.throws(() => providers.of('nobody'), e => e instanceof providers.ProviderError && e.failure.status === 'error')
})
