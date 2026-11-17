// Files exported from Mint, Monarch and YNAB (shared/app-exports.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectApp, mapCategory, readImport } from '../shared/app-exports.ts'
import { parseCsv } from '../shared/statements.ts'
import { CATEGORIES } from '../shared/categories.ts'

const MINT = `"Date","Description","Original Description","Amount","Transaction Type","Category","Account Name","Labels","Notes"
"1/15/2026","Whole Foods","WHOLEFDS MKT 10234","54.20","debit","Groceries","Visa Card","Weekly,Family",""
"1/16/2026","Acme Payroll","ACME CORP PAYROLL","2500.00","credit","Paycheck","Checking","","January"
"1/17/2026","Shell","SHELL OIL 5741","40.00","debit","Gas & Fuel","Visa Card","",""
"1/18/2026","Thing","SOMETHING ODD","9.99","debit","Uncategorized","Visa Card","Bad""Tag",""
`

const MONARCH = `Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags
2026-02-01,Blue Bottle,☕ Coffee Shops,Chase Sapphire,BLUE BOTTLE COFFEE,,-6.50,Treats
2026-02-02,Landlord,🏠 Rent,Joint Checking,ZELLE TO LANDLORD,Feb rent,-1800.00,
2026-02-03,Employer,💰 Paychecks,Joint Checking,EMPLOYER DIR DEP,,3100.00,
`

const YNAB = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Checking","","03/01/2026","Comcast","Monthly Bills: Internet","Monthly Bills","Internet","","$79.99","$0.00","Cleared"
"Checking","","03/02/2026","Employer","Inflow: Ready to Assign","Inflow","Ready to Assign","","$0.00","$2,000.00","Cleared"
"Checking","","03/03/2026","Transfer : Savings","","","","","$500.00","$0.00","Cleared"
`

test('detectApp knows each app by its headings, and a bank file by none', () => {
  assert.equal(detectApp(parseCsv(MINT))?.app, 'mint')
  assert.equal(detectApp(parseCsv(MONARCH))?.app, 'monarch')
  assert.equal(detectApp(parseCsv(YNAB))?.app, 'ynab')
  assert.equal(detectApp(parseCsv('Date,Description,Amount\n2026-01-01,Coffee,-3.00\n')), null)
})

test('Mint: signs from the transaction type, the busiest account first, its tags and notes', () => {
  const read = readImport('transactions.csv', MINT)
  assert.equal(read.app, 'mint')
  assert.deepEqual(read.accounts, [{ name: 'Visa Card', count: 3 }, { name: 'Checking', count: 1 }])
  assert.equal(read.account_name, 'Visa Card')
  assert.deepEqual(read.rows[0], { posted: '2026-01-15', amount_cents: -5420, description: 'WHOLEFDS MKT 10234', payee: 'Whole Foods', category: 'groceries', tags: ['Weekly', 'Family'] })
  assert.equal(read.rows[1].category, 'transport')
  // Uncategorized is left for Cheddar to sort; a tag Cheddar can't keep is dropped.
  assert.equal(read.rows[2].category, undefined)
  assert.equal(read.rows[2].tags, undefined)
  const checking = readImport('transactions.csv', MINT, undefined, undefined, 'Checking')
  assert.deepEqual(checking.rows, [{ posted: '2026-01-16', amount_cents: 250000, description: 'ACME CORP PAYROLL', payee: 'Acme Payroll', category: 'income', note: 'January' }])
})

test('Monarch: signed amounts, emoji category names', () => {
  const read = readImport('export.csv', MONARCH, undefined, undefined, 'Joint Checking')
  assert.equal(read.app, 'monarch')
  assert.deepEqual(read.rows.map(r => [r.amount_cents, r.category, r.note]), [[-180000, 'housing', 'Feb rent'], [310000, 'income', undefined]])
  const card = readImport('export.csv', MONARCH, undefined, undefined, 'Chase Sapphire')
  assert.deepEqual(card.rows[0], { posted: '2026-02-01', amount_cents: -650, description: 'BLUE BOTTLE COFFEE', payee: 'Blue Bottle', category: 'dining', tags: ['Treats'] })
})

test('YNAB: outflow and inflow, its category groups', () => {
  const read = readImport('register.csv', YNAB)
  assert.equal(read.app, 'ynab')
  assert.deepEqual(read.rows.map(r => [r.posted, r.amount_cents, r.category]), [
    ['2026-03-01', -7999, 'utilities'], ['2026-03-02', 200000, 'income'], ['2026-03-03', -50000, undefined],
  ])
  assert.equal(read.rows[0].description, 'Comcast')
})

test('an account not in the file reads as the busiest one; a bank file reads as before', () => {
  assert.equal(readImport('t.csv', MINT, undefined, undefined, 'Nope').account_name, 'Visa Card')
  const bank = readImport('bank.csv', 'Date,Description,Amount\n2026-01-01,Coffee,-3.00\n')
  assert.equal(bank.app, undefined)
  assert.deepEqual(bank.rows, [{ posted: '2026-01-01', amount_cents: -300, description: 'Coffee' }])
})

test('mapCategory: common names from each app', () => {
  const ids = new Set(CATEGORIES.map(c => c.id))
  const cases = {
    'Restaurants': 'dining', 'Fast Food': 'dining', 'Alcohol & Bars': 'dining', 'Restaurants & Bars': 'dining',
    'Auto Insurance': 'insurance', 'Health Insurance': 'insurance', 'Gas & Electric': 'utilities', 'Gas': 'transport',
    'Mortgage & Rent': 'housing', 'Home Improvement': 'housing', 'Home Phone': 'utilities', 'Mobile Phone': 'utilities',
    'Air Travel': 'travel', 'Hotel': 'travel', 'Parking': 'transport', 'Ride Share': 'transport',
    'Doctor': 'health', 'Pharmacy': 'health', 'Gym': 'health', 'Hair': 'personal', 'Tuition': 'education',
    'Student Loan': 'loans', 'Auto Payment': 'loans', 'Charity': 'gifts', 'Gift': 'gifts', 'Bank Fee': 'fees',
    'Finance Charge': 'fees', 'Federal Tax': 'taxes', 'Property Tax': 'taxes', 'Paycheck': 'income', 'Interest': 'income',
    'Transfer': 'transfer', 'Credit Card Payment': 'transfer', 'Clothing': 'shopping', 'Electronics & Software': 'shopping',
    'Movies & DVDs': 'entertainment', 'Streaming Services': 'entertainment', 'Uncategorized': '', '': '',
    'Everyday Expenses: Groceries': 'groceries', 'Fun Money: Something': '', 'Inflow: Ready to Assign': 'income',
  }
  for (const [name, want] of Object.entries(cases)) {
    assert.equal(mapCategory(name), want, name)
    if (want) assert.ok(ids.has(want))
  }
})
