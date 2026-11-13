// Browser smoke test: sign up, be held at two-step setup until it's on, set
// the profile, import a statement (a CSV, then a PDF) and undo it, sign out and back in with a
// code, on a desktop and a phone-sized screen, with no console errors. Run it
// through nginx in front of the production build, where the strict CSP
// applies: an inline script the nonce doesn't cover would break hydration
// here first (tests/README.md).
//
//   APP_URL=http://localhost:8085 node tests/ui.mjs
//
// Uses installed Chrome, or CHROME_PATH. Cleans up its account through
// PocketBase as the superuser (PB_URL, PB_SU_EMAIL, PB_SU_PASS).
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { loadHookModule } from './load-hook-module.mjs'
import { makePdf, rows } from './make-pdf.mjs'
import { unzip } from './unzip.mjs'

const APP = (process.env.APP_URL || 'http://localhost:8085').replace(/\/$/, '')
const PB = (process.env.PB_URL || 'http://127.0.0.1:8095').replace(/\/$/, '')
const totp = loadHookModule('pb_hooks/lib/totp.js')
const email = `ui-${randomBytes(6).toString('hex')}@cheddar.test`
const password = 'correct horse battery'
// The statement is this month's, so Spending shows it without paging back.
const now = new Date()
const yyyy = String(now.getFullYear())
const mm = String(now.getMonth() + 1).padStart(2, '0')

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
const errors = []
const watch = (page) => {
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(e.message))
}

// The page in use, for a screenshot if a step fails (ui-failure.png, ignored by git).
let current
try {
  const page = await browser.newPage()
  current = page
  watch(page)

  // A signed-out visitor is sent to sign in.
  await page.goto(`${APP}/settings`)
  await page.waitForURL(/\/login\?next=(%2F|\/)settings/)

  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Name').fill('Ui Test')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Two-step sign-in comes first: every other page sends a new account back here.
  await page.getByRole('heading', { name: 'Protect your account' }).waitFor()
  await page.goto(`${APP}/settings`)
  await page.getByRole('heading', { name: 'Protect your account' }).waitFor()
  assert.match(page.url(), /\/setup$/)
  await page.getByRole('button', { name: 'Turn on' }).click()
  // A field a tap reveals takes the focus, so typing goes straight into it.
  assert.ok(await page.getByLabel('Enter your password to continue').evaluate(el => el === document.activeElement), 'password field focused')
  await page.getByLabel('Enter your password to continue').fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('img', { name: 'QR code for your authenticator app' }).waitFor()
  await page.getByText('Can\'t scan?').click()
  const secret = (await page.locator('.secret').textContent()).trim()
  await page.getByLabel('6-digit code').fill(totp.codeAt(secret, totp.stepAt(Date.now())))
  await page.getByRole('button', { name: 'Turn on' }).click()
  await page.getByText('Save your recovery codes').waitFor()
  assert.equal(await page.locator('.codes li').count(), 10)
  await page.getByRole('button', { name: 'I\'ve saved them' }).click()
  await page.getByRole('heading', { name: 'Hi, Ui' }).waitFor()
  assert.equal(await page.getByText('Set up · 3 left').count(), 1)

  // Profile: every state is offered.
  await page.goto(`${APP}/settings`)
  await page.getByText('10 recovery codes left.').waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Linked banks and cards' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Turn off' }).count(), 0)
  assert.equal(await page.getByLabel('State you file taxes in').locator('option').count(), 52)
  await page.getByLabel('State you file taxes in').selectOption('CA')
  await page.getByLabel('Federal filing status').selectOption('single')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Saved').waitFor()

  // Requests that succeed with 204 No Content show their success. (A 204
  // once read as a failure, so the confirm button seemed to do nothing.)
  await page.getByRole('button', { name: 'Send confirmation email' }).click()
  await page.getByText('Sent. Check your inbox.').waitFor()
  // The emailed links carry tokens only mail delivers, so the server's
  // answer is stood in for: exactly the 204 the pages must read as success.
  await page.route('**/api/auth/confirm-verification', route => route.fulfill({ status: 204 }))
  await page.goto(`${APP}/verify-email?token=from-the-email`)
  await page.getByRole('button', { name: 'Confirm email' }).click()
  await page.getByText('Your email is confirmed.').waitFor()
  await page.unroute('**/api/auth/confirm-verification')

  // Accounts are set up in one place, Accounts, which the Overview's checklist leads to.
  await page.goto(`${APP}/`)
  await page.getByRole('link', { name: /Connect your accounts/ }).click()
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Linked banks and cards' }).waitFor()
  await page.getByRole('button', { name: 'Link a bank or card' }).waitFor()

  // Money: an account, a statement file previewed and imported, its
  // transactions on Spending, and the import undone.
  await page.getByRole('button', { name: 'Add an account…' }).click()
  await page.getByLabel('Name').fill('Everyday checking')
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.getByRole('link', { name: 'Import a statement into Everyday checking' }).click()
  await page.getByRole('heading', { name: 'Import', exact: true }).waitFor()
  await page.getByLabel('PDF statements, or CSV, OFX or QFX files').setInputFiles({
    name: 'november.csv', mimeType: 'text/csv',
    buffer: Buffer.from(`Posting Date,Description,Amount\n${mm}/01/${yyyy},COFFEE,-4.50\n${mm}/02/${yyyy},"GROCERY, INC",-82.10\n${mm}/03/${yyyy},PAYCHECK,2500.00\nTotal,,\n`),
  })
  await page.getByText('1 line won\'t be imported').waitFor()
  assert.equal(await page.locator('table.preview tbody tr').count(), 3)
  assert.equal(await page.locator('table.preview tbody td').first().textContent(), `${yyyy}-${mm}-01`)
  await page.getByRole('button', { name: 'Import 3 transactions' }).click()
  await page.getByText('Imported 3 transactions into Everyday checking.').waitFor()
  await page.getByRole('link', { name: 'See transactions' }).click()
  await page.getByRole('heading', { name: 'Spending' }).waitFor()
  // Sorted into categories on their own; one moved by hand takes its merchant's rule with it.
  await page.getByText('$86.60').first().waitFor()
  await page.getByRole('link', { name: /Groceries/ }).click()
  await page.getByRole('heading', { name: 'Groceries' }).waitFor()
  await page.getByText('GROCERY, INC').waitFor()
  assert.equal(await page.getByText('\u2212$82.10').count(), 1)
  await page.getByLabel('Category for GROCERY, INC').selectOption('shopping')
  await page.getByRole('status').filter({ hasText: 'GROCERY, INC is now in Shopping.' }).waitFor()
  await page.getByText('Nothing in Groceries').waitFor()
  await page.getByRole('link', { name: 'All categories' }).click()
  await page.getByRole('link', { name: /Shopping/ }).waitFor()
  await page.getByRole('link', { name: /Income/ }).waitFor()
  // A category of one's own, made from the picker on any transaction.
  await page.getByRole('link', { name: /All transactions/ }).click()
  await page.getByRole('heading', { name: 'All transactions' }).waitFor()
  await page.getByLabel('Category for COFFEE').selectOption('__new')
  await page.getByLabel('Name for the new category').fill('Coffee runs')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'COFFEE is now in Coffee runs.' }).waitFor()
  await page.getByRole('link', { name: 'All categories' }).click()
  await page.getByRole('link', { name: /Coffee runs/ }).click()
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('New name').fill('Coffee')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('heading', { name: 'Coffee', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('heading', { name: 'Categories' }).waitFor()
  await page.getByRole('link', { name: /Dining and drinks/ }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Import', exact: true }).count(), 0)

  // One added by hand, found by a search, given a note and left out of the totals.
  await page.getByRole('button', { name: 'Add a transaction', exact: true }).click()
  await page.getByLabel('What it was').fill('Farmers market')
  await page.getByLabel('Amount', { exact: true }).fill('12.40')
  await page.getByRole('button', { name: 'Add transaction' }).click()
  await page.getByRole('status').filter({ hasText: 'Added Farmers market to Everyday checking.' }).waitFor()
  await page.getByLabel('Search transactions').fill('farmers')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByText('1 transaction for “farmers”, any date').waitFor()
  await page.getByRole('button', { name: /^Change Farmers market/ }).click()
  await page.getByLabel('Note (optional)').fill('Paid cash')
  await page.getByLabel('Leave out of spending, Overview, Projections and Taxes').check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Farmers market is left out of spending and taxes now.' }).waitFor()
  await page.getByText('Left out', { exact: true }).waitFor()
  await page.getByText('Paid cash').waitFor()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await page.getByRole('heading', { name: 'Categories' }).waitFor()
  await page.getByText('$86.60').first().waitFor()

  // Taking it out again: the month's transactions as a spreadsheet, and everything from Settings.
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download CSV' }).click()])
  assert.match(csv.suggestedFilename(), new RegExp(`^cheddar-transactions-${yyyy}-${mm}-01-to-${yyyy}-${mm}-\\d\\d\\.csv$`))
  assert.match(readFileSync(await csv.path(), 'utf8'), /GROCERY, INC/)
  await page.goto(`${APP}/settings`)
  await page.getByRole('button', { name: 'Export…' }).click()
  await page.getByLabel('Enter your password to export everything').fill(password)
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()])
  assert.match(zip.suggestedFilename(), /^cheddar-export-\d{4}-\d{2}-\d{2}\.zip$/)
  assert.deepEqual(Object.keys(unzip(readFileSync(await zip.path()))).sort(), ['accounts.csv', 'balance_history.csv', 'cheddar.json', 'transactions.csv'])
  await page.getByText('Your export is downloading.').waitFor()

  // Net worth: a balance entered on Accounts, added up on Overview beside the month's income and spending.
  await page.goto(`${APP}/accounts`)
  await page.getByRole('button', { name: 'Set the balance of Everyday checking' }).click()
  await page.getByLabel('Balance of Everyday checking').fill('2,413.40')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Set the balance of Everyday checking' }).filter({ hasText: '$2,413.40' }).waitFor()
  await page.goto(`${APP}/`)
  assert.equal(await page.locator('[data-test="net-worth"]').textContent(), '$2,413.40')
  await page.locator('.figures').filter({ hasText: '$2,500.00' }).filter({ hasText: '$86.60' }).waitFor()
  await page.getByText('Add a brokerage or retirement account').waitFor()

  // An account is changed in place: closed, it leaves the list until asked for, and opens again.
  await page.goto(`${APP}/accounts`)
  await page.getByRole('button', { name: 'Edit Everyday checking' }).click()
  const editor = page.getByRole('form', { name: 'Edit Everyday checking' })
  await editor.getByLabel('Bank or card issuer (optional)').fill('Big Bank')
  await editor.getByLabel('It\'s closed').check()
  await editor.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Set the balance of Everyday checking' }).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Show closed accounts (1)' }).click()
  await page.getByText(/Checking · Big Bank · Closed/).waitFor()
  await page.getByRole('button', { name: 'Edit Everyday checking' }).click()
  await editor.getByLabel('It\'s closed').uncheck()
  await editor.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: /Show closed accounts|Hide closed accounts/ }).waitFor({ state: 'detached' })
  await page.getByText('Checking · Big Bank', { exact: true }).waitFor()

  // Taxes: the federal estimate and California's, from a typed income, for the profile's state and status.
  await page.goto(`${APP}/taxes`)
  await page.locator('[data-test="income"]').fill('100,000')
  await page.getByRole('heading', { name: 'California estimate' }).waitFor()
  await page.locator('[data-test="state-tax"]').filter({ hasText: '$5,070' }).waitFor()
  assert.equal(await page.locator('[data-test="federal-tax"]').textContent(), '$13,170')
  assert.equal(await page.locator('[data-test="total-tax"]').textContent(), '$18,240')

  await page.goto(`${APP}/accounts`)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByRole('button', { name: 'Undo the import of november.csv' }).click()
  await page.getByRole('heading', { name: /^Imported into/ }).waitFor({ state: 'detached' })

  // A PDF statement, read in the browser by pdf.js under the production CSP.
  await page.getByLabel('PDF statements, or CSV, OFX or QFX files').setInputFiles({
    name: 'statement.pdf', mimeType: 'application/pdf',
    buffer: makePdf([rows(720, [
      [[50, `Statement period ${mm}/01/${yyyy} to ${mm}/28/${yyyy}`]],
      [[50, 'Date'], [110, 'Description'], [400, 'Amount'], [500, 'Balance']],
      [[50, `${mm}/01`], [110, 'Beginning balance'], [500, '1,000.00']],
      [[50, `${mm}/04`], [110, 'BAKERY'], [400, '12.40'], [500, '987.60']],
      [[50, `${mm}/05`], [110, 'REFUND FROM SHOP'], [400, '20.00'], [500, '1,007.60']],
    ])]),
  })
  await page.getByRole('heading', { name: 'From the PDF' }).waitFor()
  assert.equal(await page.locator('table.preview tbody tr').count(), 2)
  await page.locator('table.preview tbody tr').filter({ hasText: 'BAKERY' }).filter({ hasText: '\u2212$12.40' }).waitFor()
  await page.getByRole('button', { name: 'Import 2 transactions' }).click()
  await page.getByText('Imported 2 transactions into Everyday checking.').waitFor()
  await page.getByRole('button', { name: 'Undo the import of statement.pdf' }).click()
  await page.getByRole('heading', { name: /^Imported into/ }).waitFor({ state: 'detached' })

  // Several files at once: one preview, then each its own import, each undone on its own.
  await page.getByLabel('PDF statements, or CSV, OFX or QFX files').setInputFiles([
    { name: 'one.csv', mimeType: 'text/csv', buffer: Buffer.from(`Date,Description,Amount\n${mm}/06/${yyyy},LIBRARY FINE,-2.00\n`) },
    { name: 'two.csv', mimeType: 'text/csv', buffer: Buffer.from(`Date,Description,Amount\n${mm}/07/${yyyy},BOOKSHOP,-15.00\n${mm}/08/${yyyy},REFUND,5.00\n`) },
  ])
  // The files are read in the browser before the preview shows: wait for it, then count.
  await page.getByRole('button', { name: 'Import 3 transactions from 2 files' }).waitFor()
  assert.equal(await page.locator('table.preview tbody tr').count(), 3)
  await page.getByRole('button', { name: 'Import 3 transactions from 2 files' }).click()
  await page.getByText('Imported 3 transactions into Everyday checking from 2 files.').waitFor()
  await page.getByRole('button', { name: 'Undo the import of one.csv' }).click()
  await page.getByRole('button', { name: 'Undo the import of one.csv' }).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Undo the import of two.csv' }).click()
  await page.getByRole('heading', { name: /^Imported into/ }).waitFor({ state: 'detached' })

  // Out, and back in with a code.
  await page.goto(`${APP}/`)
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click()
  await page.waitForURL(/\/login/)

  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByRole('heading', { name: 'Reset your password' }).waitFor()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send link' }).click()
  await page.getByText('an email with a reset link is on its way').waitFor()
  await page.route('**/api/auth/confirm-password-reset', route => route.fulfill({ status: 204 }))
  await page.goto(`${APP}/reset-password?token=from-the-email`)
  await page.getByLabel('New password').fill('another long password')
  await page.getByRole('button', { name: 'Save password' }).click()
  await page.getByText('Your password is changed').waitFor()
  await page.unroute('**/api/auth/confirm-password-reset')

  await page.goto(`${APP}/login`)
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Enter your code' }).waitFor()
  await page.getByLabel('Code').fill(totp.codeAt(secret, totp.stepAt(Date.now()) + 1))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'Hi, Ui' }).waitFor()

  // On a phone: the tab bar, and Settings in the header.
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, storageState: await page.context().storageState() })
  const p = await phone.newPage()
  current = p
  watch(p)
  await p.goto(`${APP}/`)
  await p.getByRole('link', { name: 'Spending' }).last().click()
  await p.getByRole('heading', { name: 'Spending', exact: true }).waitFor()
  await p.getByRole('link', { name: 'Settings' }).click()
  await p.getByRole('heading', { name: 'Settings' }).waitFor()

  // Deleting the account ends on the sign-in page.
  await p.getByRole('button', { name: 'Delete…' }).click()
  await p.getByLabel('Enter your password to delete your account for good').fill(password)
  await p.getByRole('button', { name: 'Delete my account' }).click()
  await p.waitForURL(/\/login/)

  assert.deepEqual(errors, [], 'console errors')
  console.log('✔ ui smoke test passed')
}
catch (e) {
  await current?.screenshot({ path: 'ui-failure.png' }).catch(() => {})
  throw e
}
finally {
  await browser.close()
  const su = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: process.env.PB_SU_EMAIL, password: process.env.PB_SU_PASS }),
  }).then(r => r.json())
  const found = await fetch(`${PB}/api/collections/users/records?filter=${encodeURIComponent(`email='${email}'`)}`, { headers: { authorization: su.token } }).then(r => r.json())
  for (const u of found.items ?? []) {
    await fetch(`${PB}/api/collections/users/records/${u.id}`, { method: 'DELETE', headers: { authorization: su.token } })
  }
}
