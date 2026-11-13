// Unit tests for the migrations folder (migrations/README.md): every file is
// one scripts/migrate.mjs will run, and no two share a number (issue #37).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'

const files = readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f !== 'README.md')
// The pattern scripts/migrate.mjs runs; anything else would be skipped without a word.
const RUNS = /^\d{4}_[a-z0-9_]+\.mjs$/
// Applied before this check existed, and never renamed (an applied file's name is its identity).
const KNOWN_PAIRS = new Set(['0010'])

test('every file is a migration that will run', () => {
  for (const f of files) assert.match(f, RUNS, `${f} isn't NNNN_lowercase_words.mjs, so it would never run`)
})

test('no two migrations share a number', () => {
  const by = Map.groupBy(files, f => f.slice(0, 4))
  for (const [n, same] of by) {
    if (KNOWN_PAIRS.has(n)) continue
    assert.equal(same.length, 1, `${same.join(' and ')} share ${n}: give the newer one the next free number`)
  }
})

test('numbers run on without gaps, so the next one is plain', () => {
  const numbers = [...new Set(files.map(f => Number(f.slice(0, 4))))].sort((a, b) => a - b)
  numbers.forEach((n, i) => assert.equal(n, i + 1, `no migration numbered ${String(i + 1).padStart(4, '0')}`))
})
