// Accounts, statement imports and transactions, end to end through nginx and
// Nuxt against a real PocketBase: what one person adds, nobody else sees or
// changes, and importing a file twice adds its transactions once.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { asPb, PB, client, ready, signedIn } from './helpers.mjs'

const CSV = 'Transaction Date,Description,Amount\n'
  + '11/01/2026,COFFEE,-4.50\n'
  + '11/01/2026,COFFEE,-4.50\n' // the same coffee twice that day: both are real
  + '11/02/2026,"GROCERY, INC",-82.10\n'
  + '11/03/2026,PAYCHECK,2500.00\n'

const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>4111000011112222</CCACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>-19.99<FITID>F1<NAME>STREAMING
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-5.00<FITID>F2<NAME>PARKING
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`

async function account(c, body = { name: 'Everyday', kind: 'checking' }) {
  const r = await c.call('POST', '/api/accounts', body)
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

const upload = (c, accountId, text, filename = 'statement.csv', mapping) =>
  c.call('POST', '/api/imports', { account: accountId, filename, text, ...(mapping ? { mapping } : {}) })

const transactions = async (c, accountId) => (await c.call('GET', `/api/transactions?account=${accountId}`)).json

describe('accounts', () => {
  test('are added, listed by name and deleted by their owner', async () => {
    const { c } = await ready()
    const b = await account(c, { name: 'Visa', kind: 'credit_card', institution: 'Big Bank', last4: '1234' })
    const a = await account(c, { name: 'Checking', kind: 'checking' })
    assert.deepEqual((await c.call('GET', '/api/accounts')).json.accounts.map(x => x.name), ['Checking', 'Visa'])
    assert.deepEqual([b.institution, b.last4, b.currency, b.source], ['Big Bank', '1234', 'USD', 'manual'])
    assert.equal((await c.call('DELETE', `/api/accounts/${a.id}`)).status, 204)
    assert.deepEqual((await c.call('GET', '/api/accounts')).json.accounts.map(x => x.name), ['Visa'])
  })

  test('refuses one with no name, an unknown kind or a bad last four', async () => {
    const { c } = await ready()
    assert.match((await c.call('POST', '/api/accounts', { name: '', kind: 'checking' })).json.message, /name/)
    assert.match((await c.call('POST', '/api/accounts', { name: 'A', kind: 'crypto' })).json.message, /kind/)
    assert.match((await c.call('POST', '/api/accounts', { name: 'A', kind: 'loan', last4: 'abcd' })).json.message, /four digits/)
  })

  test('need two-step sign-in: a password-only session can add or see none', async () => {
    const { c } = await signedIn()
    assert.equal((await c.call('POST', '/api/accounts', { name: 'A', kind: 'checking' })).status, 400)
    assert.deepEqual((await c.call('GET', '/api/accounts')).json.accounts, [])
  })

  test('are hidden from everyone else, who can neither delete nor import into them', async () => {
    const owner = await ready()
    const other = await ready()
    const mine = await account(owner.c)
    assert.deepEqual((await other.c.call('GET', '/api/accounts')).json.accounts, [])
    assert.equal((await other.c.call('DELETE', `/api/accounts/${mine.id}`)).status, 404)
    assert.equal((await upload(other.c, mine.id, CSV)).status, 404)
    assert.equal((await other.c.call('GET', `/api/transactions?account=${mine.id}`)).json.total, 0)
    assert.equal((await owner.c.call('GET', '/api/accounts')).json.accounts.length, 1)
  })

  test('the store itself refuses a transaction or import written into someone else\'s account', async () => {
    const owner = await ready()
    const other = await ready()
    const mine = await account(owner.c)
    // PocketBase straight, with the other person's own token: the rules hold even without the app.
    const token = asPb(other.c)
    const post = (collection, body) => fetch(`${PB}/api/collections/${collection}/records`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...token }, body: JSON.stringify(body),
    })
    const tx = await post('transactions', { owner: other.id, account: mine.id, posted: '2026-01-01', amount_cents: -100, source: 'manual' })
    assert.ok([400, 403].includes(tx.status), `transaction: ${tx.status}`)
    const imp = await post('imports', { owner: other.id, account: mine.id, format: 'csv' })
    assert.ok([400, 403].includes(imp.status), `import: ${imp.status}`)
    assert.equal((await transactions(owner.c, mine.id)).total, 0)
  })
})

describe('importing a statement', () => {
  test('adds a CSV\'s rows, newest first, as signed cents', async () => {
    const { c } = await ready()
    const a = await account(c)
    const r = await upload(c, a.id, CSV, 'nov.csv')
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.deepEqual([r.json.import.added, r.json.import.skipped, r.json.unreadable], [4, 0, 0])
    assert.deepEqual([r.json.import.first_date, r.json.import.last_date, r.json.import.filename], ['2026-11-01', '2026-11-03', 'nov.csv'])
    const list = await transactions(c, a.id)
    assert.equal(list.total, 4)
    assert.deepEqual(list.items.map(t => [t.posted, t.amount_cents, t.description]), [
      ['2026-11-03', 250000, 'PAYCHECK'],
      ['2026-11-02', -8210, 'GROCERY, INC'],
      ['2026-11-01', -450, 'COFFEE'],
      ['2026-11-01', -450, 'COFFEE'],
    ])
    assert.ok(list.items.every(t => t.source === 'import'))
  })

  test('skips what is already there: the same file twice, or one that overlaps it', async () => {
    const { c } = await ready()
    const a = await account(c)
    await upload(c, a.id, CSV)
    const again = await upload(c, a.id, CSV)
    assert.deepEqual([again.json.import.added, again.json.import.skipped], [0, 4])
    const overlap = await upload(c, a.id, `${CSV}11/04/2026,RENT,-1500.00\n`)
    assert.deepEqual([overlap.json.import.added, overlap.json.import.skipped], [1, 4])
    assert.equal((await transactions(c, a.id)).total, 5)
  })

  test('the same file into a second account is that account\'s own', async () => {
    const { c } = await ready()
    const a = await account(c)
    const b = await account(c, { name: 'Joint', kind: 'checking' })
    await upload(c, a.id, CSV)
    assert.equal((await upload(c, b.id, CSV)).json.import.added, 4)
    assert.equal((await c.call('GET', '/api/transactions')).json.total, 8)
  })

  test('reads OFX and QFX, and knows a row again by the bank\'s own id', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'Card', kind: 'credit_card' })
    const r = await upload(c, a.id, OFX, 'card.qfx')
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.deepEqual([r.json.import.format, r.json.import.added], ['ofx', 2])
    // The bank renames a row; its FITID still says it's the same one.
    assert.equal((await upload(c, a.id, OFX.replace('PARKING', 'CITY PARKING'), 'card.qfx')).json.import.added, 0)
    assert.deepEqual((await transactions(c, a.id)).items.map(t => t.amount_cents), [-500, -1999])
  })

  test('reads a PDF statement\'s text as its account\'s kind says, and flips it when asked', async () => {
    const { c } = await ready()
    const card = await account(c, { name: 'Card', kind: 'credit_card' })
    // What the browser sends for a PDF: its text, never the PDF (shared/pdf-statements.ts).
    const text = '%cheddar-pdf-text 1\nOpening/Closing Date 10/05/26 - 11/04/26\n'
      + '10/12  PAYMENT THANK YOU  -500.00\n10/20  BOOKSHOP  42.10\nTotal fees for this period  0.00\n'
    const r = await upload(c, card.id, text, 'october.pdf')
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.deepEqual([r.json.import.format, r.json.import.added, r.json.import.filename], ['pdf', 2, 'october.pdf'])
    assert.deepEqual((await transactions(c, card.id)).items.map(t => [t.posted, t.amount_cents]), [['2026-10-20', -4210], ['2026-10-12', 50000]])

    const checking = await account(c)
    const flipped = await c.call('POST', '/api/imports', { account: checking.id, filename: 'october.pdf', text, flip: true })
    assert.equal(flipped.status, 201, JSON.stringify(flipped.json))
    assert.deepEqual((await transactions(c, checking.id)).items.map(t => t.amount_cents), [-4210, 50000])

    const letter = await upload(c, checking.id, '%cheddar-pdf-text 1\nThank you for banking with us.\n', 'letter.pdf')
    assert.equal(letter.status, 400)
    assert.match(letter.json.message, /No transactions could be found/)
  })

  test('a balance entered is dated today in the person\'s own time zone, not the server\'s', async () => {
    const { c } = await ready()
    const day = zone => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const savings = await account(c, { name: 'Savings', kind: 'savings' })
    // UTC+14 and UTC-12 are always on different days, so neither can pass by being UTC's.
    for (const zone of ['Pacific/Kiritimati', 'Etc/GMT+12']) {
      assert.equal((await c.call('PATCH', '/api/profile', { time_zone: zone })).json.me.time_zone, zone)
      const before = day(zone)
      const r = await c.call('PATCH', `/api/accounts/${savings.id}`, { balance: '100.00' })
      assert.equal(r.status, 200, JSON.stringify(r.json))
      assert.ok([before, day(zone)].includes(r.json.account.balance_date), `${zone}: ${r.json.account.balance_date}`)
    }
    assert.equal((await c.call('PATCH', '/api/profile', { time_zone: 'Mars/Olympus_Mons' })).status, 400)
  })

  test('a statement\'s closing balance becomes the account\'s, unless the account has a newer one', async () => {
    const { c } = await ready()
    const card = await account(c, { name: 'Card', kind: 'credit_card' })
    const statement = (period, owed, row) => `%cheddar-pdf-text 1\nStatement Period ${period}\nNew Balance  $${owed}\n${row}\n`

    const october = await upload(c, card.id, statement('09/18/2026 to 10/18/2026', '1,200.00', '10/01  BOOKSHOP  42.10'), 'october.pdf')
    assert.equal(october.status, 201, JSON.stringify(october.json))
    assert.deepEqual(october.json.balance, { cents: -120000, date: '2026-10-18' })
    const november = await upload(c, card.id, statement('10/19/2026 to 11/08/2026', '300.00', '11/01  CAFE  4.75'), 'november.pdf')
    assert.deepEqual(november.json.balance, { cents: -30000, date: '2026-11-08' })
    // An older statement imported afterwards leaves the newer balance alone.
    const september = await upload(c, card.id, statement('08/18/2026 to 09/17/2026', '900.00', '09/01  TEA  3.00'), 'september.pdf')
    assert.equal(september.status, 201)
    assert.equal(september.json.balance, null)
    const now = (await c.call('GET', '/api/accounts')).json.accounts.find(a => a.id === card.id)
    assert.deepEqual([now.balance_cents, now.balance_date], [-30000, '2026-11-08'])
    // Net worth counts it.
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, -30000)

    // A file with no balance in it changes nothing.
    const csv = await upload(c, card.id, 'Date,Description,Amount\n2026-11-20,Shop,-5.00\n')
    assert.equal(csv.status, 201)
    assert.equal(csv.json.balance, null)
  })

  test('uses the columns the person chose, such as flipped signs for a card', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'Card', kind: 'credit_card' })
    const csv = 'Date,Description,Amount\n2026-01-01,Shop,25.00\n2026-01-02,Payment,-100.00\n'
    const mapping = { header: 0, date: 0, description: 1, amount: 2, debit: -1, credit: -1, dateOrder: 'mdy', flip: true }
    assert.equal((await upload(c, a.id, csv, 'amex.csv', mapping)).status, 201)
    assert.deepEqual((await transactions(c, a.id)).items.map(t => t.amount_cents), [10000, -2500])
    const bad = await upload(c, a.id, csv, 'amex.csv', { ...mapping, amount: 7 })
    assert.equal(bad.status, 400)
    assert.match(bad.json.message, /columns from the file/)
  })

  test('says what is wrong with a file it cannot read', async () => {
    const { c } = await ready()
    const a = await account(c)
    assert.match((await upload(c, a.id, 'just,some\nwords,here\n')).json.message, /column headings/)
    assert.match((await upload(c, a.id, '')).json.message, /Choose a file/)
    const unreadable = await upload(c, a.id, 'Date,Amount\nsoon,1\n')
    assert.equal(unreadable.status, 400)
    assert.match(unreadable.json.message, /No line/)
    assert.equal((await c.call('GET', '/api/imports')).json.imports.length, 0)
  })

  test('takes a file of a few megabytes, through nginx and Nuxt\'s size limits', async () => {
    const { c } = await ready()
    const a = await account(c)
    let csv = 'Date,Description,Amount\n'
    for (let i = 0; i < 4000; i++) csv += `2026-01-${String(1 + (i % 28)).padStart(2, '0')},"A ""quoted"" description, row ${i} ${'x'.repeat(600)}",-1.00\n`
    assert.ok(csv.length > 2_500_000)
    const r = await upload(c, a.id, csv)
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.equal(r.json.import.added, 4000)
  })

  test('undo removes what that import added, and only that', async () => {
    const { c } = await ready()
    const a = await account(c)
    const first = (await upload(c, a.id, CSV)).json.import
    const second = (await upload(c, a.id, `${CSV}11/04/2026,RENT,-1500.00\n`)).json.import
    assert.deepEqual((await c.call('GET', `/api/imports?account=${a.id}`)).json.imports.map(i => i.id), [second.id, first.id])
    assert.equal((await c.call('DELETE', `/api/imports/${second.id}`)).status, 204)
    assert.equal((await transactions(c, a.id)).total, 4)
    // Undone, the row is new again.
    assert.equal((await upload(c, a.id, `${CSV}11/04/2026,RENT,-1500.00\n`)).json.import.added, 1)
  })

  test('someone else can neither list nor undo an import', async () => {
    const owner = await ready()
    const other = await ready()
    const a = await account(owner.c)
    const imp = (await upload(owner.c, a.id, CSV)).json.import
    assert.deepEqual((await other.c.call('GET', '/api/imports')).json.imports, [])
    assert.equal((await other.c.call('DELETE', `/api/imports/${imp.id}`)).status, 404)
    assert.equal((await transactions(owner.c, a.id)).total, 4)
  })

  test('deleting the account deletes its transactions and imports', async () => {
    const { c } = await ready()
    const a = await account(c)
    await upload(c, a.id, CSV)
    await c.call('DELETE', `/api/accounts/${a.id}`)
    assert.equal((await c.call('GET', '/api/transactions')).json.total, 0)
    assert.deepEqual((await c.call('GET', '/api/imports')).json.imports, [])
  })

  test('refuses a request from another site', async () => {
    const { c } = await ready()
    const a = await account(c)
    const r = await c.call('POST', '/api/imports', { account: a.id, filename: 'x.csv', text: CSV }, { origin: 'https://evil.example' })
    assert.equal(r.status, 403)
    assert.equal((await client().call('GET', '/api/transactions')).status, 401)
  })
})
