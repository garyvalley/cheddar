// Browser smoke test: sign up, set up two-step sign-in, sign out and back in
// with a code, on a desktop and a phone-sized screen, with no console errors.
// Run it against the production build (`pnpm build`, then
// `node .output/server/index.mjs`), where the strict CSP applies: an inline
// script the nonce doesn't cover would break hydration here first.
//
//   APP_URL=http://127.0.0.1:3012 node tests/ui.mjs
//
// Uses installed Chrome, or CHROME_PATH. Cleans up its account through
// PocketBase as the superuser (PB_URL, PB_SU_EMAIL, PB_SU_PASS).
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright-core'
import { loadHookModule } from './load-hook-module.mjs'

const APP = (process.env.APP_URL || 'http://127.0.0.1:3012').replace(/\/$/, '')
const PB = (process.env.PB_URL || 'http://127.0.0.1:8095').replace(/\/$/, '')
const totp = loadHookModule('pb_hooks/lib/totp.js')
const email = `ui-${randomBytes(6).toString('hex')}@cheddar.test`
const password = 'correct horse battery'

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
const errors = []
const watch = (page) => {
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(e.message))
}

try {
  const page = await browser.newPage()
  watch(page)

  // A signed-out visitor is sent to sign in.
  await page.goto(`${APP}/settings`)
  await page.waitForURL(/\/login\?next=(%2F|\/)settings/)

  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Name').fill('Ui Test')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: 'Hi, Ui' }).waitFor()
  assert.equal(await page.getByText('Set up · 3 left').count(), 1)

  // Profile: every state is offered.
  await page.goto(`${APP}/settings`)
  assert.equal(await page.getByLabel('State you file taxes in').locator('option').count(), 52)
  await page.getByLabel('State you file taxes in').selectOption('CA')
  await page.getByLabel('Federal filing status').selectOption('single')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Saved').waitFor()

  // Two-step sign-in.
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
  await page.getByText('10 recovery codes left.').waitFor()

  // Out, and back in with a code.
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click()
  await page.waitForURL(/\/login/)
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
  watch(p)
  await p.goto(`${APP}/`)
  await p.getByRole('link', { name: 'Spending' }).last().click()
  await p.getByRole('heading', { name: 'Spending' }).waitFor()
  await p.getByRole('link', { name: 'Settings' }).click()
  await p.getByRole('heading', { name: 'Settings' }).waitFor()

  assert.deepEqual(errors, [], 'console errors')
  console.log('✔ ui smoke test passed')
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
