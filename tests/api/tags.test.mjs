// Tags on transactions (shared/tags.ts), end to end through Nuxt against a
// real PocketBase with its hooks: a person tags a transaction, searches by
// a tag, sees each tag's totals and a CSV column of them, and the record
// API can't store a tag the form wouldn't take, nor tag someone else's.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, asPb, ready } from './helpers.mjs'

const today = new Date().toISOString().slice(0, 10)
const us = ymd => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`

async function setUp(c) {
  const a = await c.call('POST', '/api/accounts', { name: 'Everyday', kind: 'checking' })
  assert.equal(a.status, 201, JSON.stringify(a.json))
  const text = 'Date,Description,Amount\n'
    + `${us(today)},HOTEL DEL MAR,-420.00\n`
    + `${us(today)},AIRLINE TICKET,-310.50\n`
    + `${us(today)},EMPLOYER REIMBURSEMENT,310.50\n`
    + `${us(today)},GROCERY OUTLET,-55.00\n`
  const r = await c.call('POST', '/api/imports', { account: a.json.account.id, filename: 's.csv', text })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  const items = (await c.call('GET', `/api/transactions?account=${a.json.account.id}`)).json.items
  return { account: a.json.account, tx: Object.fromEntries(items.map(t => [t.description, t])) }
}

const tag = (c, t, tags) => c.call('PATCH', `/api/transactions/${t.id}`, { tags })

describe('tags', () => {
  test('tag, search by tag, totals and the CSV column', async () => {
    const { c } = await ready()
    const { tx } = await setUp(c)

    const hotel = await tag(c, tx['HOTEL DEL MAR'], ['Vacation 2026', ' vacation  2026 ', 'Tax-deductible'])
    assert.equal(hotel.status, 200, JSON.stringify(hotel.json))
    assert.deepEqual(hotel.json.transaction.tags, ['Vacation 2026', 'Tax-deductible'], 'tidied, the same tag kept once')
    assert.equal((await tag(c, tx['AIRLINE TICKET'], 'Vacation 2026, Reimbursable')).status, 200, 'a comma-separated line works too')
    assert.equal((await tag(c, tx['EMPLOYER REIMBURSEMENT'], ['reimbursable'])).status, 200)

    // Search by tag, whatever its case; a tag is a whole tag, not a part of one.
    const found = (await c.call('GET', '/api/transactions?tag=VACATION%202026')).json
    assert.deepEqual(found.items.map(t => t.description).sort(), ['AIRLINE TICKET', 'HOTEL DEL MAR'])
    assert.equal((await c.call('GET', '/api/transactions?tag=Vacation')).json.total, 0)
    assert.equal((await c.call('GET', '/api/transactions?tag=%22')).status, 400)

    // Totals: money out and in per tag, most spent first; what's left out doesn't count.
    await c.call('PATCH', `/api/transactions/${tx['GROCERY OUTLET'].id}`, { tags: ['Vacation 2026'], excluded: true })
    const totals = (await c.call('GET', `/api/tags?from=${today}&to=${today}`)).json
    assert.deepEqual(totals.totals.map(t => [t.tag, t.count, t.out_cents, t.in_cents]), [
      ['Vacation 2026', 2, 73050, 0],
      ['Tax-deductible', 1, 42000, 0],
      ['Reimbursable', 2, 31050, 31050],
    ])
    assert.deepEqual(totals.known, ['Reimbursable', 'Tax-deductible', 'Vacation 2026'])
    assert.deepEqual((await c.call('GET', '/api/tags?from=2000-01-01&to=2000-01-31')).json.totals, [])

    const csv = await c.call('GET', '/api/transactions/csv?tag=reimbursable')
    const lines = String(csv.json).trim().split(/\r?\n/)
    assert.match(lines[0], /,Tags,/)
    assert.ok(lines.slice(1).some(l => l.includes('"Vacation 2026, Reimbursable"')), lines.join('\n'))

    // Taking them off.
    const off = await tag(c, tx['HOTEL DEL MAR'], [])
    assert.deepEqual(off.json.transaction.tags, [])
  })

  test('refuses tags the form wouldn\'t take, whichever way they come, and someone else\'s transactions', async () => {
    const { c } = await ready()
    const { tx } = await setUp(c)
    const t = tx['GROCERY OUTLET']
    for (const [tags, why] of [
      [['x'.repeat(31)], 'too long'],
      [['say "hi"'], 'a quote'],
      [Array.from({ length: 11 }, (_, i) => `t${i}`), 'too many'],
      [[''], 'empty'],
      [[3], 'not words'],
      [{ a: 1 }, 'not a list'],
    ]) assert.equal((await tag(c, t, tags)).status, 400, why)

    const direct = await fetch(`${PB}/api/collections/transactions/records/${t.id}`, {
      method: 'PATCH',
      headers: { ...asPb(c), 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['ok', 'not"ok'] }),
    })
    assert.equal(direct.status, 400, 'the hook checks the record API too')
    const tidy = await fetch(`${PB}/api/collections/transactions/records/${t.id}`, {
      method: 'PATCH',
      headers: { ...asPb(c), 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['  Business ', 'business'] }),
    })
    assert.equal(tidy.status, 200)
    assert.deepEqual((await tidy.json()).tags, ['Business'])

    const other = await ready()
    assert.equal((await tag(other.c, t, ['Mine'])).status, 404)
    assert.deepEqual((await other.c.call('GET', '/api/tags')).json, { totals: [], known: [] })
  })
})
