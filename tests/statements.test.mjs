// Unit tests for shared/statements.ts and shared/accounts.ts: reading the
// CSV, OFX and QFX files banks export, and the rules for a new account.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAccount, checkAccountChange, formatCents } from '../shared/accounts.ts'
import { detectFormat, guessMapping, parseAmount, parseCsv, parseDate, readStatement } from '../shared/statements.ts'

describe('amounts', () => {
  test('read every way banks write them, as signed cents', () => {
    const cases = {
      '12.34': 1234, '-12.34': -1234, '1,234.56': 123456, '$1,234.56': 123456, '-$12.00': -1200,
      '$-12.00': -1200, '(12.00)': -1200, '12.00-': -1200, '12.00 DR': -1200, '12.00 CR': 1200,
      '+5': 500, '.5': 50, '12.': 1200, '0.00': 0, '-0.00': 0, ' 7 ': 700,
    }
    for (const [raw, cents] of Object.entries(cases)) assert.equal(parseAmount(raw), cents, raw)
  })

  test('are null when there is no number', () => {
    for (const raw of ['', ' ', 'abc', '.', '12.345', '1,23', '--']) assert.equal(parseAmount(raw), null, raw)
  })
})

describe('dates', () => {
  test('read ISO, compact, US, day-first and written-out forms', () => {
    assert.equal(parseDate('2026-03-04'), '2026-03-04')
    assert.equal(parseDate('2026-03-04T10:00:00'), '2026-03-04')
    assert.equal(parseDate('20260304120000.000[-5:EST]'), '2026-03-04')
    assert.equal(parseDate('03/04/2026'), '2026-03-04')
    assert.equal(parseDate('3/4/26'), '2026-03-04')
    assert.equal(parseDate('03/04/2026', 'dmy'), '2026-04-03')
    assert.equal(parseDate('Mar 4, 2026'), '2026-03-04')
    assert.equal(parseDate('4 March 2026'), '2026-03-04')
    assert.equal(parseDate('04-Mar-2026'), '2026-03-04')
  })

  test('refuse dates that do not exist', () => {
    for (const raw of ['2026-02-30', '13/01/2026', '', 'yesterday', '2026-00-10', '02/29/2025']) assert.equal(parseDate(raw), null, raw)
    assert.equal(parseDate('02/29/2028'), '2028-02-29')
  })
})

describe('CSV', () => {
  test('parses quotes, quoted delimiters, doubled quotes and line breaks', () => {
    assert.deepEqual(parseCsv('a,"b,c","say ""hi""","two\nlines"\r\n1,2,3,4'), [
      ['a', 'b,c', 'say "hi"', 'two\nlines'], ['1', '2', '3', '4'],
    ])
  })

  test('finds a semicolon or tab delimiter, and drops a BOM', () => {
    assert.deepEqual(parseCsv('\uFEFFDate;Amount\n2026-01-01;5'), [['Date', 'Amount'], ['2026-01-01', '5']])
    assert.deepEqual(parseCsv('Date\tAmount\n2026-01-01\t5'), [['Date', 'Amount'], ['2026-01-01', '5']])
  })

  test('reads a card export with a signed amount column', () => {
    const csv = 'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n'
      + '11/02/2026,11/03/2026,COFFEE SHOP,Food & Drink,Sale,-4.50,\n'
      + '11/01/2026,11/02/2026,"PAYMENT, THANK YOU",,Payment,250.00,\n'
    const s = readStatement('chase.csv', csv)
    assert.equal(s.format, 'csv')
    assert.deepEqual(s.columns.slice(0, 3), ['Transaction Date', 'Post Date', 'Description'])
    assert.deepEqual(s.rows, [
      { posted: '2026-11-02', amount_cents: -450, description: 'COFFEE SHOP' },
      { posted: '2026-11-01', amount_cents: 25000, description: 'PAYMENT, THANK YOU' },
    ])
    assert.deepEqual(s.problems, [])
  })

  test('reads separate money out and money in columns, whichever way out is signed', () => {
    const csv = 'Date,Details,Withdrawals,Deposits\n2026-01-05,Rent,1500.00,\n2026-01-06,Pay,,3000.00\n2026-01-07,Fee,-2.00,\n'
    assert.deepEqual(readStatement('b.csv', csv).rows.map(r => r.amount_cents), [-150000, 300000, -200])
  })

  test('skips summary lines above the headings and reports lines it cannot read', () => {
    const csv = 'Description,,Summary Amt.\nBeginning balance as of 01/01/2026,,"1,000.00"\n\n'
      + 'Date,Description,Amount,Running Bal.\n01/01/2026,Beginning balance,,1000.00\n01/02/2026,Groceries,-55.10,944.90\n'
    const s = readStatement('boa.csv', csv)
    assert.equal(s.mapping.header, 3)
    assert.deepEqual(s.rows, [{ posted: '2026-01-02', amount_cents: -5510, description: 'Groceries' }])
    assert.deepEqual(s.problems, [{ line: 5, problem: 'No amount' }])
  })

  test('guesses day-first dates when one cannot be month-first', () => {
    const records = parseCsv('Date,Amount,Name\n03/04/2026,1,a\n25/04/2026,1,b\n')
    assert.equal(guessMapping(records).dateOrder, 'dmy')
  })

  test('flips signs for a card that shows charges as positive', () => {
    const csv = 'Date,Description,Amount\n2026-01-01,Shop,25.00\n2026-01-02,Payment,-100.00\n'
    const m = { ...guessMapping(parseCsv(csv)), flip: true }
    assert.deepEqual(readStatement('amex.csv', csv, m).rows.map(r => r.amount_cents), [-2500, 10000])
  })

  test('refuses a file with no headings it knows, and a mapping outside the file', () => {
    assert.match(readStatement('x.csv', 'a,b\n1,2\n').problem, /column headings/)
    const csv = 'Date,Amount\n2026-01-01,1\n'
    assert.match(readStatement('x.csv', csv, { ...guessMapping(parseCsv(csv)), amount: 9 }).problem, /columns from the file/)
    assert.match(readStatement('x.csv', '  \n').problem, /empty/)
  })
})

describe('OFX and QFX', () => {
  const sgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD
<BANKACCTFROM><BANKID>121000248<ACCTID>000123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000.000[-7:PDT]<TRNAMT>-42.17<FITID>2026100301<NAME>GROCERY &amp; CO<MEMO>POS PURCHASE
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261015<TRNAMT>2500.00<FITID>2026101502<NAME>PAYROLL
</BANKTRANLIST><LEDGERBAL><BALAMT>3157.83<DTASOF>20261031</LEDGERBAL><AVAILBAL><BALAMT>3000.00<DTASOF>20261031</AVAILBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

  test('reads OFX 1 (SGML, unclosed elements) with its ids and account', () => {
    assert.equal(detectFormat('download.qfx', ''), 'ofx')
    assert.equal(detectFormat('download.txt', sgml), 'ofx')
    const s = readStatement('download.qfx', sgml)
    assert.equal(s.format, 'ofx')
    assert.deepEqual(s.rows, [
      { posted: '2026-10-03', amount_cents: -4217, description: 'GROCERY & CO POS PURCHASE', fitid: '2026100301' },
      { posted: '2026-10-15', amount_cents: 250000, description: 'PAYROLL', fitid: '2026101502' },
    ])
    assert.deepEqual(s.account, { last4: '6789', kind: 'checking' })
    // The ledger balance, not the available one.
    assert.deepEqual(s.closing, { cents: 315783, date: '2026-10-31' })
  })

  test('reads OFX 2 (XML) for a card', () => {
    const xml = `<?xml version="1.0"?><?OFX OFXHEADER="200"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<CCACCTFROM><ACCTID>4111111111111111</ACCTID></CCACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261101</DTPOSTED><TRNAMT>-9.99</TRNAMT><FITID>A1</FITID><NAME>STREAMING</NAME></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>-421.50</BALAMT><DTASOF>20261104</DTASOF></LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`
    const s = readStatement('card.ofx', xml)
    assert.deepEqual(s.rows, [{ posted: '2026-11-01', amount_cents: -999, description: 'STREAMING', fitid: 'A1' }])
    assert.deepEqual(s.account, { last4: '1111', kind: 'credit_card' })
    assert.deepEqual(s.closing, { cents: -42150, date: '2026-11-04' })
  })

  test('says so when a file has no transactions', () => {
    assert.match(readStatement('empty.ofx', '<OFX></OFX>').problem, /No transactions/)
  })
})

describe('a new account', () => {
  test('needs a name and a kind, and four digits if any', () => {
    assert.deepEqual(checkAccount({ name: ' Everyday ', kind: 'checking', last4: '1234' }),
      { ok: { name: 'Everyday', kind: 'checking', institution: '', last4: '1234' } })
    assert.match(checkAccount({ name: '', kind: 'checking' }).problem, /name/)
    assert.match(checkAccount({ name: 'A', kind: 'crypto' }).problem, /kind/)
    assert.match(checkAccount({ name: 'A', kind: 'loan', last4: '12' }).problem, /four digits/)
    assert.match(checkAccount({ name: 'A', kind: 'loan', institution: 5 }).problem, /bank/)
  })

  test('a change takes only what was sent, checked as a new account is', () => {
    const now = { name: 'Visa', kind: 'other', institution: 'Big Bank', last4: '1234' }
    assert.deepEqual(checkAccountChange({ kind: 'credit_card', name: ' Card ' }, now, '2026-11-13'), { ok: { name: 'Card', kind: 'credit_card' } })
    assert.deepEqual(checkAccountChange({ last4: '', institution: '' }, now, '2026-11-13'), { ok: { institution: '', last4: '' } })
    assert.deepEqual(checkAccountChange({}, now, '2026-11-13'), { ok: {} })
    assert.match(checkAccountChange({ name: '' }, now, '2026-11-13').problem, /name/)
    assert.match(checkAccountChange({ kind: 'crypto' }, now, '2026-11-13').problem, /kind/)
    assert.match(checkAccountChange({ last4: '12' }, now, '2026-11-13').problem, /four digits/)
  })

  test('closes on a real day no later than today, opens again with none, and is counted or not', () => {
    const now = { name: 'Loan', kind: 'loan', institution: '', last4: '' }
    assert.deepEqual(checkAccountChange({ closed_on: '2026-11-13', excluded: true }, now, '2026-11-13'), { ok: { closed_on: '2026-11-13', excluded: true } })
    assert.deepEqual(checkAccountChange({ closed_on: '' }, now, '2026-11-13'), { ok: { closed_on: '' } })
    assert.match(checkAccountChange({ closed_on: '2026-11-14' }, now, '2026-11-13').problem, /future/)
    assert.match(checkAccountChange({ closed_on: '2026-02-30' }, now, '2026-11-13').problem, /date/)
    assert.match(checkAccountChange({ closed_on: 20261101 }, now, '2026-11-13').problem, /date/)
    assert.match(checkAccountChange({ excluded: 'yes' }, now, '2026-11-13').problem, /count/)
  })

  test('money shows with a true minus sign', () => {
    assert.equal(formatCents(-123456), '\u2212$1,234.56')
    assert.equal(formatCents(5), '$0.05')
  })
})
