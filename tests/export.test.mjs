// Unit tests for shared/export.ts and server/data/zip.ts: the spreadsheets
// an export holds, safe to open in Excel, and the zip they come in.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accountsCsv, balanceHistoryCsv, csvCell, csvName, exportFiles, toCsv, transactionsCsv } from '../shared/export.ts'
import { BUILT_IN } from '../shared/categories.ts'
import { zip } from '../server/data/zip.ts'
import { unzip } from './unzip.mjs'

const BOM = '\uFEFF'
const accounts = [
  { id: 'a1', name: 'Everyday', kind: 'checking', institution: 'Big Bank', last4: '1234', currency: 'USD', source: 'manual', balance_cents: 123456, balance_date: '2026-11-01', linked: false, closed_on: '', excluded: false },
  { id: 'a2', name: 'Visa', kind: 'credit_card', institution: '', last4: '', currency: 'USD', source: 'sync', balance_cents: null, balance_date: '', linked: true, closed_on: '2026-10-31', excluded: true },
]
const tx = (over) => ({ id: 't', account: 'a1', posted: '2026-11-02', amount_cents: -450, description: 'COFFEE', payee: '', category: 'dining', category_by: 'match', pending: false, source: 'import', note: '', excluded: false, import: '', ...over })

describe('CSV cells', () => {
  test('that a spreadsheet would run as a formula start with a quote mark', () => {
    for (const s of ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) {
      assert.ok(csvCell(s).replace(/^"/, '').startsWith('\''), s)
    }
    assert.equal(csvCell('=1+1'), '\'=1+1')
  })

  test('leave numbers as numbers, negative ones too', () => {
    assert.equal(csvCell(-12.34), '-12.34')
    assert.equal(csvCell(0), '0')
    assert.equal(csvCell(Number.NaN), '')
  })

  test('are quoted when they hold a comma, a quote or a line break', () => {
    assert.equal(csvCell('GROCERY, INC'), '"GROCERY, INC"')
    assert.equal(csvCell('say "hi"'), '"say ""hi"""')
    assert.equal(csvCell('two\nlines'), '"two\nlines"')
    assert.equal(csvCell('plain'), 'plain')
    assert.equal(csvCell(true), 'yes')
  })

  test('make a file Excel reads as UTF-8, rows ending in CRLF', () => {
    assert.equal(toCsv(['A', 'B'], [['café', 1]]), `${BOM}A,B\r\ncafé,1\r\n`)
  })
})

describe('the spreadsheets', () => {
  test('transactions: date, account, amount in dollars, description, payee, category by name, note, left out, split', () => {
    const csv = transactionsCsv([
      tx({}),
      tx({ account: 'a2', amount_cents: 250000, description: '=cmd|calc', payee: 'ACME', category: 'income', pending: true, note: 'Bonus, finally', excluded: true }),
      tx({ amount_cents: -12000, description: 'COSTCO', category: 'groceries', splits: [{ category: 'groceries', amount_cents: -8000 }, { category: 'shopping', amount_cents: -4000 }] }),
    ], accounts, BUILT_IN)
    assert.equal(csv, `${BOM}Date,Account,Amount,Description,Payee,Category,Pending,Note,Left out,Split\r\n`
      + '2026-11-02,Everyday,-4.5,COFFEE,,Dining and drinks,no,,no,\r\n'
      + '2026-11-02,Visa,2500,\'=cmd|calc,ACME,Income,yes,"Bonus, finally",yes,\r\n'
      + '2026-11-02,Everyday,-120,COSTCO,,Groceries,no,,no,Groceries -80.00; Shopping -40.00\r\n')
  })

  test('accounts: a balance only once there is one', () => {
    const lines = accountsCsv(accounts).split('\r\n')
    assert.equal(lines[1], 'Everyday,Checking,Big Bank,1234,1234.56,2026-11-01,no,,yes')
    assert.equal(lines[2], 'Visa,Credit card,,,,,yes,2026-10-31,no')
  })

  test('balance history names each account', () => {
    assert.equal(balanceHistoryCsv([{ account: 'a1', date: '2026-11-01', balance_cents: -5 }], accounts).split('\r\n')[1], '2026-11-01,Everyday,-0.05')
  })

  test('a download is named for its days', () => {
    assert.equal(csvName('2026-11-01', '2026-11-30'), 'cheddar-transactions-2026-11-01-to-2026-11-30.csv')
    assert.equal(csvName(), 'cheddar-transactions.csv')
  })
})

describe('the zip', () => {
  const data = {
    cheddar_export: 1, exported: '2026-11-13T00:00:00.000Z',
    profile: { name: 'Zoë', email: 'z@example.com', state: 'CA', filing_status: 'single', theme: 'violet', appearance: 'auto', time_zone: 'America/Los_Angeles' },
    accounts, transactions: [tx({})], imports: [], balance_history: [], categories: BUILT_IN,
    category_rules: [{ merchant: 'coffee', category: 'dining' }], bank_links: [],
  }

  test('holds the three spreadsheets and cheddar.json, which reads back as the export', () => {
    const files = unzip(zip(exportFiles(data)))
    assert.deepEqual(Object.keys(files), ['accounts.csv', 'transactions.csv', 'balance_history.csv', 'cheddar.json'])
    assert.deepEqual(JSON.parse(files['cheddar.json']), data)
    assert.match(files['transactions.csv'], /COFFEE/)
  })

  test('opens with the system unzip, when there is one', (t) => {
    let has = true
    try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }) }
    catch { has = false }
    if (!has) return t.skip('no unzip here')
    const dir = mkdtempSync(join(tmpdir(), 'cheddar-zip-'))
    writeFileSync(join(dir, 'x.zip'), zip({ 'a.txt': 'hello '.repeat(1000), 'b.csv': 'é,1\r\n' }))
    const list = execFileSync('unzip', ['-t', join(dir, 'x.zip')], { encoding: 'utf8' })
    assert.match(list, /No errors detected/)
  })
})
