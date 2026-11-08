// Writes public/favicon.svg and renders the Home Screen icons in public/icons
// from the mark in shared/mark.ts. Re-run after changing the mark:
//   node scripts/make-icons.mjs        (uses installed Chrome, or CHROME_PATH)
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { MARK_COLOURS, markSvg, wedgeSvg } from '../shared/mark.ts'

const out = new URL('../public/icons/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
writeFileSync(new URL('../public/favicon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${markSvg()}</svg>\n`)

// A full-bleed square tile (the OS rounds it). `scale` is the share of the
// tile the wedge's 32-unit grid spans: maskable icons keep it inside the
// middle 80%, which any mask leaves visible.
const tile = (size, scale) => {
  const span = size * scale
  const off = (size - span) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" fill="${MARK_COLOURS.tile}"/>`
    + `<g transform="translate(${off} ${off}) scale(${span / 32})">${wedgeSvg()}</g></svg>`
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
for (const [name, size, scale] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.8], ['apple-touch-icon.png', 180, 1]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<html><body style="margin:0">${tile(size, scale)}</body></html>`)
  await page.screenshot({ path: `${out}${name}` })
  await page.close()
}
await browser.close()
