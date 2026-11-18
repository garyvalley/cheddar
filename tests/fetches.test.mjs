// Pages load their data in parallel (issue #114): a page or component that
// awaits one useFetch after another makes a first, server-rendered load
// wait for each in turn. Start them together with Promise.all instead, or
// list the file here when a later request needs an earlier one's answer.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// Its imports are listed by the account the first request picks.
const DEPENDENT = new Set(['pages/settings/import.vue'])

describe('page data', () => {
  test('is fetched in parallel', () => {
    const root = new URL('../app/', import.meta.url)
    const files = readdirSync(root, { recursive: true }).filter(f => f.endsWith('.vue'))
    assert.ok(files.length > 20)
    for (const f of files) {
      if (DEPENDENT.has(f)) continue
      // A lazy one (`lazy: true`) doesn't hold the page.
      const awaited = (readFileSync(new URL(f, root), 'utf8').match(/^const .*= await use(Fetch|AsyncData)\b.*$/gm) ?? []).filter(l => !l.includes('lazy: true'))
      assert.ok(awaited.length <= 1, `app/${f} awaits ${awaited.length} requests one after another: start them together with Promise.all`)
    }
  })
})
