// Unit tests for the top bar (app/layouts/default.vue): its white text reads
// at 4.5:1 or more on every theme's bar, light and dark (app/assets/css/main.css).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const blocks = Object.fromEntries(
  [...css.matchAll(/^:root(?:\[data-theme="(\w+)"\])? \{([^}]*)\}/gm)].map(m => [m[1] ?? 'violet', m[2]]),
)
const hex = h => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16))
const luminance = rgb => rgb.map(c => c / 255)
  .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
// color-mix(in srgb, a p%, b): sRGB channels mixed, as browsers do.
const mix = (a, p, b) => a.map((c, i) => c * p + b[i] * (1 - p))
// An rgb(255 255 255 / a) text colour laid over the bar.
const over = (alpha, ground) => ground.map(c => 255 * alpha + c * (1 - alpha))

const bar = css.match(/--bar: light-dark\(var\(--mark-tile\), color-mix\(in srgb, var\(--mark-tile\) (\d+)%, (#[0-9a-f]{6})\)\);/)
const soft = css.match(/--on-bar-2: rgb\(255 255 255 \/ (\d+)%\);/)

test('the bar is the theme\'s tile in light mode and a dimmed tile in dark', () => {
  assert.ok(bar, '--bar as light-dark(var(--mark-tile), color-mix(…))')
  assert.ok(soft, '--on-bar-2 as translucent white')
})

test('white and the softer white read at 4.5:1 on every theme\'s bar', () => {
  for (const [theme, body] of Object.entries(blocks)) {
    const tile = hex(body.match(/--mark-tile: (#[0-9a-f]{6});/)[1])
    const grounds = { light: tile, dark: mix(tile, Number(bar[1]) / 100, hex(bar[2])) }
    for (const [mode, ground] of Object.entries(grounds)) {
      for (const [name, ink] of [['--on-bar', [255, 255, 255]], ['--on-bar-2', over(Number(soft[1]) / 100, ground)]]) {
        const ratio = contrast(ink, ground)
        assert.ok(ratio >= 4.5, `${theme} ${mode}: ${name} is ${ratio.toFixed(2)}:1`)
      }
    }
  }
})
