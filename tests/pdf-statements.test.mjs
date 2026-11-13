// Unit tests for shared/pdf-statements.ts: PDF statements, made here as real
// PDFs (make-pdf.mjs) and read by pdf.js as the browser does, then read as
// transactions as the server does.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { makePdf, rows } from './make-pdf.mjs'
import { PDF_TEXT_MARK, pdfLines, pdfPages, pdfText, readPdfText } from '../shared/pdf-statements.ts'
import { detectFormat, readStatement } from '../shared/statements.ts'

/** The text the browser would send for a PDF of these pages. */
async function textOf(pages) {
  const task = pdfjs.getDocument({ data: new Uint8Array(makePdf(pages)), verbosity: 0 })
  try {
    return pdfText(await pdfPages(await task.promise))
  }
  finally {
    await task.destroy()
  }
}

const brief = r => [r.posted, r.description, r.amount_cents]

describe('reading a PDF\'s text', () => {
  test('keeps each printed line together, in reading order, with columns apart', async () => {
    const text = await textOf([
      rows(700, [
        [[50, 'First Platypus Bank']],
        [[400, '4.50'], [50, '10/07'], [100, 'COFFEE SHOP #12']],
      ]),
      rows(700, [[[50, 'Page 2']]]),
    ])
    const lines = text.split('\n')
    assert.equal(lines[0], PDF_TEXT_MARK)
    assert.deepEqual(lines.slice(1, -1), ['First Platypus Bank', '10/07  COFFEE SHOP #12  4.50', 'Page 2'])
    assert.equal(detectFormat('statement.pdf', text), 'pdf')
  })

  test('puts pieces a little above or below each other on one line', () => {
    const item = (str, x, y) => ({ str, x, y, width: str.length * 5, height: 10 })
    assert.deepEqual(pdfLines([[item('10/07', 50, 700), item('4.50', 400, 701.5), item('NEXT', 50, 686)]]), ['10/07  4.50', 'NEXT'])
  })
})

describe('a checking statement', () => {
  const period = [[50, 'Statement period: October 5, 2026 through November 4, 2026']]
  const head = [[50, 'Date'], [100, 'Description'], [400, 'Amount'], [500, 'Balance']]

  test('takes each sign from how the running balance moved', async () => {
    const text = await textOf([rows(720, [
      period, head,
      [[50, '10/05'], [100, 'Beginning balance'], [500, '2,000.00']],
      [[50, '10/07'], [100, 'COFFEE SHOP #12'], [400, '4.50'], [500, '1,995.50']],
      [[50, '10/15'], [100, 'PAYROLL ACME DIRECT DEP'], [400, '3,200.00'], [500, '5,195.50']],
      [[50, '11/01'], [100, 'RENT PAYMENT'], [400, '1,800.00'], [500, '3,395.50']],
      [[50, '11/04'], [100, 'Ending balance'], [500, '3,395.50']],
    ])])
    const read = readStatement('october.pdf', text)
    assert.equal(read.format, 'pdf')
    assert.deepEqual(read.rows.map(brief), [
      ['2026-10-07', 'COFFEE SHOP #12', -450],
      ['2026-10-15', 'PAYROLL ACME DIRECT DEP', 320000],
      ['2026-11-01', 'RENT PAYMENT', -180000],
    ])
    assert.deepEqual(read.problems, [])
    // Its ending balance, on the last day of its period.
    assert.deepEqual(read.closing, { cents: 339550, date: '2026-11-04' })
  })

  test('with no "Ending balance" line, closes on its last running balance', async () => {
    const text = await textOf([rows(720, [
      period, head,
      [[50, '10/07'], [100, 'COFFEE SHOP #12'], [400, '4.50'], [500, '1,995.50']],
      [[50, '10/15'], [100, 'PAYROLL'], [400, '3,200.00'], [500, '5,195.50']],
    ])])
    assert.deepEqual(readStatement('s.pdf', text).closing, { cents: 519550, date: '2026-11-04' })
  })

  test('with no balance anywhere, says none', async () => {
    const text = await textOf([rows(720, [period, [[50, '10/07'], [100, 'COFFEE'], [400, '-4.50']]])])
    assert.equal(readStatement('s.pdf', text).closing, undefined)
  })

  test('with no balance, takes the sign from the heading the line is under', async () => {
    const text = await textOf([rows(720, [
      period,
      [[50, 'DEPOSITS AND ADDITIONS']],
      [[50, '10/15'], [100, 'PAYROLL ACME'], [400, '$3,200.00']],
      [[50, 'Total deposits and additions'], [400, '$3,200.00']],
      [[50, 'ELECTRONIC WITHDRAWALS']],
      [[50, '10/16'], [100, 'CITY WATER UTILITY'], [400, '$62.18']],
      [[50, '10/20'], [100, 'Card purchase 10/18 GROCER'], [400, '$82.10']],
      [[50, 'FEES']],
      [[50, '10/31'], [100, 'Monthly service fee'], [400, '$12.00']],
    ])])
    assert.deepEqual(readStatement('s.pdf', text).rows.map(brief), [
      ['2026-10-15', 'PAYROLL ACME', 320000],
      ['2026-10-16', 'CITY WATER UTILITY', -6218],
      ['2026-10-20', 'Card purchase 10/18 GROCER', -8210],
      ['2026-10-31', 'Monthly service fee', -1200],
    ])
  })

  test('a statement that signs its amounts is read as printed', async () => {
    const text = await textOf([rows(720, [
      period,
      [[50, '10/07/2026'], [120, 'COFFEE'], [400, '-4.50']],
      [[50, '10/15/2026'], [120, 'PAYROLL'], [400, '3,200.00']],
      [[50, '10/16/2026'], [120, 'ATM'], [400, '(60.00)']],
    ])])
    assert.deepEqual(readStatement('s.pdf', text).rows.map(r => r.amount_cents), [-450, 320000, -6000])
  })

  test('flipping turns every sign round', async () => {
    const text = await textOf([rows(720, [period, [[50, '10/07'], [100, 'COFFEE'], [400, '4.50']]])])
    assert.deepEqual(readStatement('s.pdf', text, undefined, { flip: true }).rows.map(r => r.amount_cents), [450])
  })
})

describe('a card statement', () => {
  test('charges are money out and payments money in, and December lands in the year before January', async () => {
    const text = await textOf([rows(720, [
      [[50, 'Opening/Closing Date 12/05/25 - 01/04/26']],
      [[50, 'Previous Balance'], [400, '$1,000.00']],
      [[50, 'New Balance'], [400, '$1,536.85']],
      [[50, 'Payment Due Date: 02/01/26'], [400, 'Minimum Payment Due: $35.00']],
      [[50, 'PAYMENTS AND OTHER CREDITS']],
      [[50, '12/12'], [100, 'PAYMENT THANK YOU'], [400, '-500.00']],
      [[50, 'PURCHASE']],
      [[50, '12/20'], [90, '12/21'], [130, 'BOOKSHOP PORTLAND OR'], [400, '42.10']],
      [[50, '01/02'], [90, '01/03'], [130, 'CAFE'], [400, '4.75']],
      [[50, '01/03'], [130, 'RETURN BOOKSHOP'], [400, '10.00 CR']],
    ])])
    const read = readStatement('card.pdf', text, undefined, { liability: true })
    assert.deepEqual(read.rows.map(brief), [
      ['2025-12-12', 'PAYMENT THANK YOU', 50000],
      ['2025-12-20', 'BOOKSHOP PORTLAND OR', -4210],
      ['2026-01-02', 'CAFE', -475],
      ['2026-01-03', 'RETURN BOOKSHOP', 1000],
    ])
    // What a card owes is the account's negative balance, as of the closing date, not the due date.
    assert.deepEqual(read.closing, { cents: -153685, date: '2026-01-04' })
  })

  test('unsigned, its sections say which way', async () => {
    const text = await textOf([rows(720, [
      [[50, 'Statement Closing Date Nov 4, 2026']],
      [[50, 'Payments and Credits']],
      [[50, 'Oct 12'], [100, 'ONLINE PAYMENT'], [400, '$500.00']],
      [[50, 'Purchases and Adjustments']],
      [[50, 'Oct 20'], [100, 'BOOKSHOP'], [400, '$42.10']],
    ])])
    assert.deepEqual(readStatement('card.pdf', text, undefined, { liability: true }).rows.map(brief), [
      ['2026-10-12', 'ONLINE PAYMENT', 50000],
      ['2026-10-20', 'BOOKSHOP', -4210],
    ])
  })
})

describe('a Wells Fargo card statement', () => {
  // Its layout, with made-up rows: the card's last four digits before the
  // dates, a reference number before the description, credits and charges
  // in sections, and foreign purchases with a conversion line under them.
  test('reads every charge and credit, matching the statement\'s totals', async () => {
    const line = (card, trans, post, ref, text, amount) => [[40, card], [80, trans], [115, post], [150, ref], [260, text], [520, amount]]
    const text = await textOf([rows(740, [
      [[40, 'Statement Period 09/18/2026 to 10/18/2026']],
      [[40, 'Payment Due Date'], [200, '11/12/2026']],
      [[40, '= New Balance'], [200, '$2,500.00'], [300, 'Available Credit'], [450, '$7,500.00']],
      [[40, '- Payments'], [200, '$500.00'], [300, 'Cash Advance Limit'], [450, '$5,000']],
      [[40, '+ Purchases, Balance Transfers &'], [200, '$1,390.12']],
      [[40, 'Card'], [80, 'Trans'], [115, 'Post'], [150, 'Reference Number'], [260, 'Description'], [460, 'Credits'], [520, 'Charges']],
      [[40, 'Payments']],
      [[80, '10/09'], [115, '10/09'], [150, '1111111AA1AAAAA1A'], [260, 'ONLINE ACH PAYMENT THANK YOU'], [460, '500.00']],
      [[40, 'TOTAL PAYMENTS FOR THIS PERIOD'], [460, '$500.00']],
      [[40, 'Other Credits']],
      line('1234', '09/21', '09/22', '2222222BB2BBBBB2B', 'CASH BACK REDEMPTION REF 100000001', '100.00'),
      [[40, 'Purchases, Balance Transfers & Other Charges']],
      line('1234', '09/17', '09/18', '3333333CC3CCCCC3C', 'NOODLE BAR SPRINGFIELD OR', '31.50'),
      line('1234', '09/19', '09/19', '4444444DD4DDDDD4D', 'HARDWARE BARN SPRINGFIELD OR', '1,250.00'),
      line('1234', '10/08', '10/08', '5555555EE5EEEEE5E', 'TEA ROOM LONDON GB', '18.75'),
      [[40, '-'], [80, '10/08'], [260, 'GB POUND STERLNG']],
      [[40, '-'], [80, '10/08'], [260, '14.00 X  1.33928571']],
      line('1234', '10/17', '10/17', '6666666FF6FFFFF6F', 'CORNER CAFE 555-0100 OR', '89.87'),
      [[40, 'TOTAL PURCHASES, BALANCE TRANSFERS & OTHER CHARGES FOR THIS PERIOD'], [520, '$1,390.12']],
      [[40, 'Interest Charged']],
      [[40, 'INTEREST CHARGE ON PURCHASES'], [520, '0.00']],
    ])])
    const read = readStatement('card.pdf', text, undefined, { liability: true })
    assert.deepEqual(read.problems, [])
    assert.deepEqual(read.rows.map(brief), [
      ['2026-10-09', 'ONLINE ACH PAYMENT THANK YOU', 50000],
      ['2026-09-21', 'CASH BACK REDEMPTION REF 100000001', 10000],
      ['2026-09-17', 'NOODLE BAR SPRINGFIELD OR', -3150],
      ['2026-09-19', 'HARDWARE BARN SPRINGFIELD OR', -125000],
      ['2026-10-08', 'TEA ROOM LONDON GB', -1875],
      ['2026-10-17', 'CORNER CAFE 555-0100 OR', -8987],
    ])
    assert.equal(read.rows.filter(r => r.amount_cents < 0).reduce((t, r) => t + r.amount_cents, 0), -139012)
    assert.deepEqual(read.closing, { cents: -250000, date: '2026-10-18' })
  })
})

describe('what isn\'t a statement', () => {
  test('a PDF with no dated lines says so, and so does one whose text never arrived', async () => {
    const text = await textOf([rows(720, [[[50, 'Thank you for banking with us.']]])])
    assert.match(readStatement('letter.pdf', text).problem, /No transactions could be found in this PDF/)
    assert.match(readStatement('raw.pdf', '%PDF-1.4\n...').problem, /couldn't be read/)
  })

  test('with no year printed anywhere, dates take the latest year that isn\'t after today', () => {
    const text = `${PDF_TEXT_MARK}\n12/30  COFFEE  4.50\n01/02  TEA  3.00\n`
    assert.deepEqual(readPdfText(text, { today: '2026-01-10' }).rows.map(r => r.posted), ['2025-12-30', '2026-01-02'])
  })

  test('a CSV that happens to name itself .pdf isn\'t read as one', () => {
    assert.equal(detectFormat('x.pdf', 'Date,Description,Amount\n'), 'csv')
  })
})
