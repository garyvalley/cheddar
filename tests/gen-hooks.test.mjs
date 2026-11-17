// The hooks' copies of shared/ TypeScript (pb_hooks/lib/gen/, issue #34) are
// built from it by scripts/gen-hooks.mjs: each must be what the source
// builds to today, so a change to shared/ can't leave the hooks behind.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { MODULES, generate } from '../scripts/gen-hooks.mjs'
import { loadHookModule } from './load-hook-module.mjs'

const dir = new URL('../pb_hooks/lib/gen/', import.meta.url)

test('every generated file is fresh: run pnpm gen:hooks after changing shared/', async () => {
  assert.deepEqual(readdirSync(dir).sort(), MODULES.map(m => `${m}.js`).sort())
  for (const name of MODULES) {
    assert.equal(readFileSync(new URL(`${name}.js`, dir), 'utf8'), await generate(name), `pb_hooks/lib/gen/${name}.js is stale`)
  }
})

test('each loads as the hooks require it, with the exports they use', () => {
  const uses = { alerts: ['chargeAlerts', 'balanceAlerts', 'billAlerts', 'budgetAlerts', 'bankAlerts', 'weeklyAlert', 'due', 'alertEmail', 'anyOn', 'addDays', 'LASTING', 'BILL_DAYS', 'CHARGE_DAYS', 'recurring', 'LOOKBACK_YEARS', 'cashflowForecast', 'linkHealth', 'carryFrom', 'overBudget', 'withCarry', 'summarize', 'expandSplits'], categories: ['CATEGORIES', 'isCategory', 'isCustomId'], contact: ['checkContact', 'topicLabel', 'KEEP_DAYS'], legal: ['hasAgreed'], links: ['transferFor', 'refundFor', 'matchable', 'TRANSFER_DAYS', 'REFUND_DAYS'], overlap: ['around', 'nearest'], property: ['valueAfter', 'daysBetween'], review: ['isHistory', 'reviewFrom'], rules: ['checkRule', 'actionsFor', 'RULES_MAX'], splits: ['checkStored', 'moveParts'], tags: ['checkTags'] }
  for (const name of MODULES) {
    const m = loadHookModule(`pb_hooks/lib/gen/${name}.js`)
    for (const fn of uses[name]) assert.ok(m[fn], `${name}.${fn}`)
  }
})
