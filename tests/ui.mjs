// Browser smoke test: sign up, be held at two-step setup until it's on, set
// the profile, sign out and back in with a code, on a desktop and a
// phone-sized screen, with no console errors. Run it through nginx in front of
// the production build, where the strict CSP applies: an inline script the
// nonce doesn't cover would break hydration here first (tests/README.md).
//
//   APP_URL=http://localhost:8085 node tests/ui.mjs
//
// Uses installed Chrome, or CHROME_PATH. Cleans up its account through
// PocketBase as the superuser (PB_URL, PB_SU_EMAIL, PB_SU_PASS).
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright-core'
import { loadHookModule } from './load-hook-module.mjs'

const APP = (process.env.APP_URL || 'http://localhost:8085').replace(/\/$/, '')
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
  assert.equal(await page.getByText('Set up · 2 left').count(), 1)

  // Profile: every state is offered.
  await page.goto(`${APP}/settings`)
  await page.getByText('10 recovery codes left.').waitFor()
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
  await p.getByRole('heading', { name: 'Spending' }).waitFor()
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
