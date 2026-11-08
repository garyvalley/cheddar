// Takes the README's screenshots (docs/screenshots/) from a running app with
// a throwaway account, then deletes it. Re-run after a visible change:
//
//   APP_URL=http://localhost:3005 node --env-file=.env scripts/screenshots.mjs
import { mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright-core'
import { loadHookModule } from '../tests/load-hook-module.mjs'

const APP = (process.env.APP_URL || 'http://localhost:3005').replace(/\/$/, '')
const PB = (process.env.PB_URL || 'http://127.0.0.1:8095').replace(/\/$/, '')
const totp = loadHookModule('pb_hooks/lib/totp.js')
const out = new URL('../docs/screenshots/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const email = `shots-${randomBytes(4).toString('hex')}@cheddar.test`
const password = 'correct horse battery'

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  const page = await desktop.newPage()
  await page.goto(`${APP}/login`)
  await page.screenshot({ path: `${out}sign-in.png` })
  await page.request.post(`${APP}/api/auth/register`, { data: { email, password, name: 'Alex Rivera' }, headers: { origin: APP } })
  await page.request.post(`${APP}/api/auth/login`, { data: { email, password }, headers: { origin: APP } })
  await page.goto(`${APP}/setup`)
  await page.screenshot({ path: `${out}setup.png` })
  const { secret } = await (await page.request.post(`${APP}/api/auth/two-step/app`, { data: { password }, headers: { origin: APP } })).json()
  await page.request.post(`${APP}/api/auth/two-step/app/confirm`, { data: { code: totp.codeAt(secret, totp.stepAt(Date.now())) }, headers: { origin: APP } })
  await page.request.patch(`${APP}/api/profile`, { data: { state: 'CA', filing_status: 'married_joint' }, headers: { origin: APP } })
  await page.goto(`${APP}/`)
  await page.screenshot({ path: `${out}overview.png` })
  await page.goto(`${APP}/settings`)
  await page.screenshot({ path: `${out}settings.png` })

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, storageState: await desktop.storageState(), colorScheme: 'dark' })
  const p = await phone.newPage()
  await p.goto(`${APP}/`)
  await p.screenshot({ path: `${out}phone-dark.png` })
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
