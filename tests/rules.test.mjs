// shared/rules.ts: what a rule may hold, what it matches, and which rule
// wins each action.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionsFor, actionWords, checkRule, conditionWords, matches } from '../shared/rules.ts'

const rule = (fields = {}) => ({ text: '', min_cents: null, max_cents: null, account: '', category: '', rename: '', exclude: false, ...fields })
const tx = (fields = {}) => ({ description: '', payee: '', amount_cents: -1000, account: 'aaaaaaaaaaaaaaa', ...fields })

test('a rule needs a condition and an action, and checks each', () => {
  assert.deepEqual(checkRule({ text: '  Blue   Bottle ', category: 'dining' }), { rule: rule({ text: 'Blue Bottle', category: 'dining' }) })
  assert.ok('rule' in checkRule({ min_cents: 0, max_cents: 0, exclude: true }), 'a $0 rule is a real one')
  for (const bad of [
    {},
    { category: 'dining' },
    { text: 'shop' },
    { text: 'shop', category: 'yachts' },
    { text: 'shop', category: 'c-short' },
    { text: 'shop', exclude: 'yes' },
    { text: 'shop', exclude: true, min_cents: 1.5 },
    { text: 'shop', exclude: true, min_cents: 900, max_cents: 100 },
    { text: 'shop', exclude: true, account: 'not-an-id' },
    { text: '***', exclude: true },
    { text: 'x'.repeat(61), exclude: true },
    { text: 'shop', rename: 'x'.repeat(101) },
    { text: 7, exclude: true },
  ]) assert.ok('problem' in checkRule(bad), JSON.stringify(bad))
  assert.ok('rule' in checkRule({ text: 'shop', category: `c-${'a'.repeat(15)}` }), 'a custom category is checked by the hooks')
})

test('words match whole words in the description or payee, ignoring case and punctuation', () => {
  const r = rule({ text: 'blue bottle', category: 'dining' })
  assert.ok(matches(r, tx({ description: 'SQ *BLUE-BOTTLE #12' })))
  assert.ok(matches(r, tx({ payee: 'Blue Bottle Coffee' })))
  assert.ok(!matches(r, tx({ description: 'BLUEBOTTLE' })))
  assert.ok(!matches(rule({ text: 'pub' }), tx({ description: 'PUBLIX 123' })), 'not part of a word')
})

test('amounts are sizes, either way, and an account narrows it', () => {
  const r = rule({ min_cents: 1000, max_cents: 2000, account: 'aaaaaaaaaaaaaaa' })
  assert.ok(matches(r, tx({ amount_cents: -1500 })))
  assert.ok(matches(r, tx({ amount_cents: 1500 })), 'a refund of that size too')
  assert.ok(matches(r, tx({ amount_cents: -1000 })) && matches(r, tx({ amount_cents: -2000 })), 'both ends count')
  assert.ok(!matches(r, tx({ amount_cents: -999 })))
  assert.ok(!matches(r, tx({ amount_cents: -1500, account: 'bbbbbbbbbbbbbbb' })))
})

test('the first matching rule wins each action', () => {
  const rules = [
    rule({ text: 'netflix', rename: 'Netflix' }),
    rule({ text: 'netflix', category: 'entertainment', rename: 'Other name' }),
    rule({ text: 'netflix', category: 'utilities', exclude: true }),
    rule({ text: 'spotify', category: 'shopping' }),
  ]
  assert.deepEqual(actionsFor(rules, tx({ description: 'NETFLIX.COM' })), { rename: 'Netflix', category: 'entertainment', exclude: true })
  assert.deepEqual(actionsFor(rules, tx({ description: 'HULU' })), {})
})

test('rules in words', () => {
  const r = rule({ text: 'netflix', min_cents: 1000, max_cents: 2050, account: 'a', category: 'entertainment', rename: 'Netflix', exclude: true })
  assert.equal(conditionWords(r, () => 'Everyday'), 'has “netflix”, $10 to $20.50, in Everyday')
  assert.equal(conditionWords(rule({ min_cents: 500 })), '$5 or more')
  assert.equal(conditionWords(rule({ max_cents: 500 })), 'up to $5')
  assert.equal(conditionWords(rule({ min_cents: 500, max_cents: 500 })), 'exactly $5')
  assert.equal(actionWords(r, () => 'Entertainment'), 'Entertainment, renamed Netflix, left out')
})
