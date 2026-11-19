// Shared household budgets (issue #113), end to end through Nuxt against a
// real PocketBase: a budget's owner shares it; every member sees it and may
// change its amount (G's choice) but nothing else, and can't remove it; a
// member's own budget for the category stays theirs; leaving the household
// stops the sharing; an outsider never sees it.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, asPb, ready, superuser } from './helpers.mjs'

async function verify(address) {
  const token = await superuser()
  const found = await fetch(`${PB}/api/collections/users/records?filter=${encodeURIComponent(`email = '${address}'`)}`, { headers: { authorization: token } })
  const user = (await found.json()).items[0]
  await fetch(`${PB}/api/collections/users/records/${user.id}`, { method: 'PATCH', headers: { 'authorization': token, 'content-type': 'application/json' }, body: JSON.stringify({ verified: true }) })
}

async function household() {
  const owner = await ready()
  const member = await ready()
  assert.equal((await owner.c.call('POST', '/api/household', { name: 'Home' })).status, 201)
  await verify(member.address)
  assert.equal((await owner.c.call('POST', '/api/household/invite', { email: member.address })).status, 201)
  const invite = (await member.c.call('GET', '/api/household')).json.invitations[0]
  assert.equal((await member.c.call('POST', `/api/household/invites/${invite.id}/accept`)).status, 200)
  return { owner, member }
}

const budgets = async c => Object.fromEntries((await c.call('GET', '/api/budgets')).json.budgets.map(b => [b.category, b]))

describe('shared household budgets', () => {
  test('shared, seen and changed by members, removed only by its owner', async () => {
    const { owner, member } = await household()
    const outsider = await ready()
    const set = await owner.c.call('PUT', '/api/budgets/groceries', { amount: '600', shared: true })
    assert.equal(set.status, 200, JSON.stringify(set.json))
    assert.equal(set.json.budget.shared_with_household, true)
    await owner.c.call('PUT', '/api/budgets/dining', { amount: '100' })

    const seen = await budgets(member.c)
    assert.deepEqual(Object.keys(seen), ['groceries'], 'only the shared one')
    assert.deepEqual([seen.groceries.amount_cents, seen.groceries.owner_name], [60000, 'Test'])
    assert.deepEqual(await budgets(outsider.c), {})

    const changed = await member.c.call('PUT', '/api/budgets/groceries', { amount: '650' })
    assert.equal(changed.status, 200, JSON.stringify(changed.json))
    assert.equal((await budgets(owner.c)).groceries.amount_cents, 65000)
    assert.equal((await member.c.call('PUT', '/api/budgets/groceries', { amount: '' })).status, 403)
    assert.equal((await member.c.call('PUT', '/api/budgets/groceries', { amount: '650', rollover: true })).status, 403)
    assert.equal((await member.c.call('PUT', '/api/budgets/groceries', { amount: '650', shared: false })).status, 403)

    // The record API holds the same line.
    const record = (await (await fetch(`${PB}/api/collections/budgets/records?filter=${encodeURIComponent('category=\'groceries\'')}`, { headers: asPb(member.c) })).json()).items[0]
    const patch = body => fetch(`${PB}/api/collections/budgets/records/${record.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...asPb(member.c) }, body: JSON.stringify(body) })
    assert.equal((await patch({ category: 'dining' })).status, 404)
    assert.equal((await patch({ owner: member.id })).status, 404)
    assert.equal((await fetch(`${PB}/api/collections/budgets/records/${record.id}`, { method: 'DELETE', headers: asPb(member.c) })).status, 404)
    assert.equal((await fetch(`${PB}/api/collections/budgets/records/${record.id}`, { headers: asPb(outsider.c) })).status, 404)

    // A member's own budget for a category is theirs, and wins for them.
    const mine = await fetch(`${PB}/api/collections/budgets/records`, { method: 'POST', headers: { 'content-type': 'application/json', ...asPb(member.c) }, body: JSON.stringify({ owner: member.id, category: 'groceries', amount_cents: 20000 }) })
    assert.equal(mine.status, 200)
    assert.deepEqual([(await budgets(member.c)).groceries.amount_cents, (await budgets(member.c)).groceries.owner_name], [20000, undefined])
    assert.equal((await budgets(owner.c)).groceries.amount_cents, 65000)
  })

  test('sharing needs a household; leaving stops it', async () => {
    const alone = await ready()
    assert.equal((await alone.c.call('PUT', '/api/budgets/groceries', { amount: '100', shared: true })).status, 400)

    const { owner, member } = await household()
    await member.c.call('PUT', '/api/budgets/travel', { amount: '300', shared: true })
    assert.ok((await budgets(owner.c)).travel)

    assert.equal((await member.c.call('POST', '/api/household/leave')).status, 204)
    assert.equal((await budgets(owner.c)).travel, undefined)
    assert.equal((await budgets(member.c)).travel.shared_with_household, undefined)
  })
})
