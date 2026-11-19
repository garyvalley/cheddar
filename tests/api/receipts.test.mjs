// Receipts on transactions (shared/receipts.ts), end to end through Nuxt
// against a real PocketBase with its hooks: the owner adds, opens, lists
// and deletes them; the export carries their files; nobody else, a
// household member included, can see or add one; and the record API can't
// store a file that isn't what it says, or too many.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { APP, PASSWORD, PB, asPb, ready } from './helpers.mjs'
import { unzip } from '../unzip.mjs'

const today = new Date().toISOString().slice(0, 10)
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('a tiny receipt')])
/** A receipt as the page sends it: multipart, the file and its name. */
function upload(c, txId, name = 'Lunch.jpg', content = JPEG) {
  const body = new FormData()
  body.set('file', new Blob([content]), name)
  body.set('name', name)
  return fetch(`${APP}/api/transactions/${txId}/receipts`, {
    method: 'POST', body,
    headers: { 'origin': APP, 'cookie': c.cookie, 'x-forwarded-for': c.from },
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }))
}

async function transaction(c) {
  const a = (await c.call('POST', '/api/accounts', { name: 'Cash', kind: 'checking' })).json.account
  const t = await c.call('POST', '/api/transactions', { account: a.id, posted: today, description: 'Lunch', amount: '12.50', direction: 'out' })
  assert.equal(t.status, 201, JSON.stringify(t.json))
  return { account: a, tx: t.json.transaction }
}

const raw = (c, path) => fetch(`${APP}${path}`, { headers: { 'cookie': c.cookie, 'x-forwarded-for': c.from } })

describe('receipts', () => {
  test('add, open, list, export and delete', async () => {
    const { c } = await ready()
    const { tx } = await transaction(c)
    const added = await upload(c, tx.id)
    assert.equal(added.status, 201, JSON.stringify(added.json))
    assert.deepEqual([added.json.receipt.name, added.json.receipt.type, added.json.receipt.size], ['Lunch.jpg', 'image/jpeg', JPEG.length])

    const listed = (await c.call('GET', `/api/transactions/${tx.id}/receipts`)).json.receipts
    assert.deepEqual(listed.map(r => r.id), [added.json.receipt.id])
    assert.equal(listed[0].data, undefined, 'the list holds no files')

    const file = await raw(c, `/api/receipts/${added.json.receipt.id}`)
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('content-type'), 'image/jpeg')
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff')
    assert.match(file.headers.get('content-security-policy') ?? '', /sandbox/)
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), JPEG)

    const exported = await fetch(`${APP}/api/export`, {
      method: 'POST',
      headers: { 'origin': APP, 'content-type': 'application/json', 'cookie': c.cookie, 'x-forwarded-for': c.from },
      body: JSON.stringify({ password: PASSWORD }),
    })
    assert.equal(exported.status, 200)
    const files = unzip(Buffer.from(await exported.arrayBuffer()))
    const data = JSON.parse(files['cheddar.json'])
    assert.equal(data.receipts.length, 1)
    assert.match(data.receipts[0].file, new RegExp(`^receipts/${today} Lunch ${added.json.receipt.id}\\.jpg$`))
    assert.ok(data.receipts[0].file in files)
    assert.equal(files[data.receipts[0].file], JPEG.toString('utf8'))

    assert.equal((await c.call('DELETE', `/api/receipts/${added.json.receipt.id}`)).status, 204)
    assert.equal((await raw(c, `/api/receipts/${added.json.receipt.id}`)).status, 404)
  })

  test('at most five on a transaction; deleting the transaction deletes them', async () => {
    const { c } = await ready()
    const { tx } = await transaction(c)
    for (let i = 0; i < 5; i++) assert.equal((await upload(c, tx.id, `r${i}.jpg`)).status, 201)
    const sixth = await upload(c, tx.id)
    assert.equal(sixth.status, 400)
    assert.match(sixth.json.message ?? sixth.json.statusMessage ?? '', /at most 5/)
    const ids = (await c.call('GET', `/api/transactions/${tx.id}/receipts`)).json.receipts.map(r => r.id)
    assert.equal((await c.call('DELETE', `/api/transactions/${tx.id}`)).status, 204)
    assert.equal((await raw(c, `/api/receipts/${ids[0]}`)).status, 404)
  })

  test('nobody else can see or add one, and the record API checks the file', async () => {
    const me = await ready()
    const other = await ready()
    const { tx } = await transaction(me.c)
    const r = (await upload(me.c, tx.id)).json.receipt
    assert.equal((await raw(other.c, `/api/receipts/${r.id}`)).status, 404)
    assert.equal((await other.c.call('DELETE', `/api/receipts/${r.id}`)).status, 404)
    assert.deepEqual((await other.c.call('GET', `/api/transactions/${tx.id}/receipts`)).json.receipts, [])
    assert.notEqual((await upload(other.c, tx.id)).status, 201)

    const make = (c, owner, name, content) => {
      const body = new FormData()
      for (const [k, v] of Object.entries({ owner, transaction: tx.id, name, type: 'image/jpeg' })) body.set(k, v)
      body.set('file', new Blob([content]), name)
      return fetch(`${PB}/api/collections/receipts/records`, { method: 'POST', headers: asPb(c), body })
    }
    assert.equal((await make(other.c, other.id, 'x.jpg', JPEG)).status, 400, 'not on someone else\'s transaction')
    assert.equal((await make(me.c, me.id, 'x.html', Buffer.from('<html><script>alert(1)</script></html>'))).status, 400, 'the file field keeps to its kinds')
    assert.equal((await upload(me.c, tx.id, 'x.jpg', Buffer.from('<script>alert(1)</script>'))).status, 400)
    const direct = await fetch(`${PB}/api/files/receipts/${r.id}/${(await (await fetch(`${PB}/api/collections/receipts/records/${r.id}`, { headers: asPb(me.c) })).json()).file}`)
    assert.equal(direct.status, 404, 'the file is protected: no token, no file')
    const patched = await fetch(`${PB}/api/collections/receipts/records/${r.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...asPb(me.c) }, body: JSON.stringify({ type: 'text/html' }),
    })
    assert.equal(patched.status, 403, 'never changed, only added or deleted')
  })
})
