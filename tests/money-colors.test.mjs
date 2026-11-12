// Unit tests for money's colours: gains green and losses red in every theme,
// light and dark (app/assets/css/main.css, app/utils/money.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { moneyTone, spendTone } from '../app/utils/money.ts'

const css = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')

// Each theme block: the default (:root) and every :root[data-theme="…"].
const blocks = Object.fromEntries(
  [...css.matchAll(/^:root(?:\[data-theme="(\w+)"\])? \{([^}]*)\}/gm)].map(m => [m[1] ?? 'violet', m[2]]),
)
const pair = (body, name) => {
  const m = body.match(new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`))
  return m && { light: m[1], dark: m[2] }
}
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('every theme is listed', () => {
  assert.deepEqual(Object.keys(blocks).sort(), ['blue', 'cheddar', 'mint', 'rose', 'violet'])
})

test('gain and loss are set once, and no theme changes them', () => {
  for (const name of ['gain', 'loss']) {
    assert.ok(pair(blocks.violet, name), `--${name} in :root`)
    for (const [theme, body] of Object.entries(blocks)) {
      if (theme !== 'violet') assert.equal(body.includes(`--${name}:`), false, `${theme} sets --${name}`)
    }
  }
})

test('gain and loss read at 4.5:1 on every theme\'s page and cards, light and dark', () => {
  for (const [theme, body] of Object.entries(blocks)) {
    for (const ground of ['bg', 'surface']) {
      const under = pair(body, ground) ?? pair(blocks.violet, ground)
      for (const name of ['gain', 'loss']) {
        const ink = pair(blocks.violet, name)
        for (const mode of ['light', 'dark']) {
          const ratio = contrast(ink[mode], under[mode])
          assert.ok(ratio >= 4.5, `${theme} ${mode}: --${name} on --${ground} is ${ratio.toFixed(2)}:1`)
        }
      }
    }
  }
})

test('a signed amount is a gain above zero and a loss below', () => {
  assert.equal(moneyTone(1), 'gain')
  assert.equal(moneyTone(-1), 'loss')
  assert.equal(moneyTone(0), '')
})

test('spending, shown positive, is a loss; a net refund is a gain', () => {
  assert.equal(spendTone(4200), 'loss')
  assert.equal(spendTone(-500), 'gain')
  assert.equal(spendTone(0), '')
})
