/**
 * Rules a person writes for their transactions (Settings → Rules), beside
 * the merchant rules Cheddar learns when they move a transaction to another
 * category. Pure, so the browser checks a form as the hooks do: they read
 * it built as lib/gen/rules.js (scripts/gen-hooks.mjs), and only they read
 * or write `transaction_rules` (pb_hooks/rules.pb.js, glue/categories.js).
 *
 * A rule has conditions (all must hold) and actions:
 *
 * - `text`: the bank's description or the payee contains it, ignoring case,
 *   punctuation and spacing ("blue bottle" finds "SQ *BLUE-BOTTLE #12").
 * - `min_cents` / `max_cents`: the amount's size, either way (a $15 charge
 *   and a $15 refund are both 1500).
 * - `account`: one of the person's accounts.
 *
 * - `category`: sorts it there. Like a merchant rule it is applied every
 *   time the transaction is saved, so changing or deleting the rule sorts
 *   again; a category picked by hand still wins.
 * - `rename`: the payee it's shown and grouped by.
 * - `exclude`: leaves it out of every total.
 *
 * Renaming and leaving out happen once, as a transaction arrives (or when
 * the person applies the rule to past ones): after that they're the
 * person's to change on the transaction itself.
 *
 * The first rule that matches (oldest first) wins each action; any rule's
 * category beats a learned merchant rule.
 */

import { isCategoryRef } from './categories.ts'

export const TEXT_MAX = 60
export const RENAME_MAX = 100
/** The most rules of their own a person can have. */
export const RULES_MAX = 200
const LARGEST = 100_000_000_000_00

export interface RuleFields {
  text: string
  min_cents: number | null
  max_cents: number | null
  /** An account id, or "" for any. */
  account: string
  /** A category id, or "" to leave the category alone. */
  category: string
  /** A new payee, or "" to leave it alone. */
  rename: string
  exclude: boolean
}

export interface Rule extends RuleFields {
  id: string
}

/** A rule Cheddar learned for a merchant: the category its transactions go to. */
export interface MerchantRule {
  id: string
  merchant: string
  category: string
}

export interface Rules {
  rules: Rule[]
  merchant: MerchantRule[]
}

/** The transaction fields a rule looks at. */
export interface RuleTarget {
  description: string
  payee: string
  amount_cents: number
  account: string
}

/** Lower case, letters and digits only, single spaces: "SQ *Blue-Bottle #12" is "sq blue bottle 12". */
export function plain(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// eslint-disable-next-line no-control-regex
const oneLine = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()

function cents(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > LARGEST) return undefined
  return v
}

const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : null)

/**
 * A rule as the form sent it, checked: `{ rule }`, or `{ problem }` in
 * words for the person. Whether the account and a custom category are the
 * person's own is the caller's to check.
 */
export function checkRule(input: unknown): { rule: RuleFields } | { problem: string } {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const text = str(b.text)
  const rename = str(b.rename)
  const account = str(b.account)
  const category = str(b.category)
  if (text === null || rename === null || account === null || category === null)
    return { problem: 'Something in that rule isn\'t text.' }
  const t = oneLine(text)
  const r = oneLine(rename)
  if (t.length > TEXT_MAX) return { problem: `Keep the words to match to ${TEXT_MAX} characters.` }
  if (text && !plain(t)) return { problem: 'The words to match need a letter or a number.' }
  if (r.length > RENAME_MAX) return { problem: `Keep the new name to ${RENAME_MAX} characters.` }
  const min = cents(b.min_cents)
  const max = cents(b.max_cents)
  if (min === undefined || max === undefined) return { problem: 'Amounts must be dollars and cents.' }
  if (min !== null && max !== null && min > max) return { problem: 'The smallest amount is more than the largest.' }
  if (account && !/^[a-z0-9]{15}$/.test(account)) return { problem: 'Choose one of your accounts.' }
  if (category && !isCategoryRef(category)) return { problem: 'Choose one of the categories.' }
  if (b.exclude !== undefined && typeof b.exclude !== 'boolean') return { problem: 'Leave out is yes or no.' }
  const exclude = b.exclude === true
  if (!t && min === null && max === null && !account)
    return { problem: 'Say which transactions it\'s for: words to match, an amount or an account.' }
  if (!category && !r && !exclude)
    return { problem: 'Say what it does: a category, a new name, or leaving them out.' }
  return { rule: { text: t, min_cents: min, max_cents: max, account, category, rename: r, exclude } }
}

/** Whether a rule's conditions all hold for a transaction. */
export function matches(rule: RuleFields, t: RuleTarget): boolean {
  if (rule.account && rule.account !== t.account) return false
  const size = Math.abs(t.amount_cents)
  if (rule.min_cents !== null && size < rule.min_cents) return false
  if (rule.max_cents !== null && size > rule.max_cents) return false
  if (rule.text) {
    const want = ` ${plain(rule.text)} `
    if (!` ${plain(t.description)} `.includes(want) && !` ${plain(t.payee)} `.includes(want)) return false
  }
  return true
}

/**
 * What the person's rules do to a transaction: each action from the first
 * rule (in the order given) that matches and has it. Empty for none.
 */
export function actionsFor(
  rules: RuleFields[],
  t: RuleTarget,
): { category?: string, rename?: string, exclude?: boolean } {
  const out: { category?: string, rename?: string, exclude?: boolean } = {}
  for (const rule of rules) {
    if (!matches(rule, t)) continue
    if (rule.category && out.category === undefined) out.category = rule.category
    if (rule.rename && out.rename === undefined) out.rename = rule.rename
    if (rule.exclude && out.exclude === undefined) out.exclude = true
  }
  return out
}

const money = (c: number) =>
  `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

/** "Description or payee has “netflix”, $10 to $20, in Everyday": a rule's conditions in words. */
export function conditionWords(rule: RuleFields, accountName: (id: string) => string = () => 'one account'): string {
  const parts: string[] = []
  if (rule.text) parts.push(`has “${rule.text}”`)
  if (rule.min_cents !== null && rule.max_cents !== null)
    parts.push(rule.min_cents === rule.max_cents ? `exactly ${money(rule.min_cents)}` : `${money(rule.min_cents)} to ${money(rule.max_cents)}`)
  else if (rule.min_cents !== null) parts.push(`${money(rule.min_cents)} or more`)
  else if (rule.max_cents !== null) parts.push(`up to ${money(rule.max_cents)}`)
  if (rule.account) parts.push(`in ${accountName(rule.account)}`)
  return parts.join(', ')
}

/** "Entertainment, renamed Netflix, left out": a rule's actions in words. */
export function actionWords(rule: RuleFields, categoryName: (id: string) => string): string {
  return [
    rule.category && categoryName(rule.category),
    rule.rename && `renamed ${rule.rename}`,
    rule.exclude && 'left out',
  ]
    .filter(Boolean)
    .join(', ')
}
