import { parseAmount } from './transactions.ts'

/**
 * Splitting one transaction across categories: a Costco trip that's part
 * groceries and part household. The parts live on the transaction itself
 * (`transactions.splits`), so it stays one row to everything that matches
 * money (statement imports, bank syncs, their overlap, Recurring) and a sync
 * that brings it up to date keeps them. Only totals read the parts: where a
 * page adds up categories, a split transaction counts as its parts instead
 * of as itself (expandSplits()).
 *
 * The parts add up to the amount when they're saved. If the amount changes
 * later (a bank sync, a tip that posts, an edit to one added by hand), what's
 * left over still counts in the transaction's own category, so every total
 * still adds up to the money that moved, and the page says the split needs
 * fixing (leftOver()). pb_hooks/splits.pb.js checks every record-API write
 * of them with checkStored(), from pb_hooks/lib/gen/splits.js: this file,
 * built for the hooks by scripts/gen-hooks.mjs.
 */

export interface SplitPart {
  category: string
  /** Signed like the transaction: negative for money out. */
  amount_cents: number
}

export const MIN_PARTS = 2
export const MAX_PARTS = 10

const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v !== 0

/**
 * The parts a stored `splits` value holds, or none when it isn't a split.
 * Whatever reads them goes through this, so a value that isn't a list of
 * parts (written some other way) counts as no split at all.
 */
export function partsOf(splits: unknown): SplitPart[] {
  if (!Array.isArray(splits) || splits.length < MIN_PARTS || splits.length > MAX_PARTS) return []
  const parts: SplitPart[] = []
  for (const p of splits) {
    if (!p || typeof p !== 'object') return []
    const { category, amount_cents } = p as Record<string, unknown>
    if (typeof category !== 'string' || !category || category.length > 20 || !isCents(amount_cents)) return []
    parts.push({ category, amount_cents })
  }
  return parts
}

/** What the parts don't cover of the amount: 0 for a split that adds up, and for one that isn't split. */
export function leftOver(t: { amount_cents: number, splits?: unknown }): number {
  const parts = partsOf(t.splits)
  return parts.length ? t.amount_cents - parts.reduce((n, p) => n + p.amount_cents, 0) : 0
}

/**
 * Rows as totals count them: a split one becomes a row per part, the same in
 * every way but its amount and category, plus one in its own category for
 * whatever the parts don't cover. Every other row stays as it is.
 */
export function expandSplits<T extends { amount_cents: number, category: string, splits?: unknown }>(rows: T[]): T[] {
  const out: T[] = []
  for (const r of rows) {
    const parts = partsOf(r.splits)
    if (!parts.length) {
      out.push(r)
      continue
    }
    for (const p of parts) out.push({ ...r, category: p.category, amount_cents: p.amount_cents })
    const rest = leftOver(r)
    if (rest) out.push({ ...r, amount_cents: rest })
  }
  return out
}

type Checked<T> = { ok: T } | { problem: string }

/**
 * A split the person asks for, from a form: each part's category and its
 * size ("80", "$12.34"), always given without a sign, since every part goes
 * the same way as the transaction. Parts in the same category become one.
 * An empty list undoes the split. `usable` says whether a category is the
 * person's to choose.
 */
export function checkSplit(input: unknown, amount_cents: number, usable: (id: string) => boolean): Checked<SplitPart[]> {
  if (!Array.isArray(input)) return { problem: 'Give the parts of the split.' }
  if (!input.length) return { ok: [] }
  if (!amount_cents) return { problem: 'A transaction of $0.00 can\'t be split.' }
  if (input.length > MAX_PARTS) return { problem: `A split has at most ${MAX_PARTS} parts.` }
  const sign = amount_cents < 0 ? -1 : 1
  const by = new Map<string, number>()
  for (const p of input) {
    const { category, amount } = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    if (typeof category !== 'string' || !usable(category)) return { problem: 'Choose a category for each part.' }
    const a = parseAmount(amount)
    if (!a || a.negative) return { problem: 'Enter each part\'s amount as a number, like 12.34.' }
    if (!a.cents) return { problem: 'Each part needs an amount. Remove the ones you don\'t need.' }
    by.set(category, (by.get(category) ?? 0) + a.cents)
  }
  if (by.size < MIN_PARTS) return { problem: 'Split it into at least two different categories.' }
  const total = [...by.values()].reduce((n, c) => n + c, 0)
  const whole = Math.abs(amount_cents)
  if (total !== whole) {
    const gap = (Math.abs(whole - total) / 100).toFixed(2)
    return { problem: total < whole ? `The parts come to $${gap} less than the whole. Add it to a part.` : `The parts come to $${gap} more than the whole.` }
  }
  return { ok: [...by].map(([category, cents]) => ({ category, amount_cents: sign * cents })) }
}

/**
 * A stored `splits` value as the record API is given it (pb_hooks/splits.pb.js):
 * the parts to store, null when it isn't split, or a problem. However it was
 * written, a stored split is two to MAX_PARTS parts, each in a category of
 * its own the person may use, each going the same way as the transaction,
 * together exactly its amount.
 */
export function checkStored(value: unknown, amount: number, usable: (id: string) => boolean): { parts: SplitPart[] | null } | { problem: string } {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return { parts: null }
  if (!Array.isArray(value)) return { problem: 'A split is a list of parts.' }
  if (!amount) return { problem: 'A transaction of $0.00 can\'t be split.' }
  if (value.length < MIN_PARTS || value.length > MAX_PARTS) return { problem: `A split has ${MIN_PARTS} to ${MAX_PARTS} parts.` }
  const seen = new Set<string>()
  let total = 0
  const parts: SplitPart[] = []
  for (const p of value) {
    if (!p || typeof p !== 'object') return { problem: 'A split is a list of parts.' }
    const { category, amount_cents } = p as Record<string, unknown>
    if (typeof category !== 'string' || !category || category.length > 20 || !usable(category)) return { problem: 'Choose a category for each part.' }
    if (seen.has(category)) return { problem: 'Each part needs a category of its own.' }
    seen.add(category)
    if (!isCents(amount_cents) || (amount_cents < 0) !== (amount < 0)) return { problem: 'Each part goes the same way as the whole.' }
    total += amount_cents
    parts.push({ category, amount_cents })
  }
  if (total !== amount) return { problem: 'The parts must add up to the whole.' }
  return { parts }
}

/**
 * What a split's parts in `from` become when that category goes: they move
 * to `to`, joining a part already there. Null when fewer than two parts are
 * left, as the split then says nothing the category doesn't.
 */
export function moveParts(parts: SplitPart[] | null | undefined, from: string, to: string): SplitPart[] | null {
  const out: SplitPart[] = []
  const at = new Map<string, number>()
  for (const p of parts ?? []) {
    const category = p.category === from ? to : p.category
    const i = at.get(category)
    if (i !== undefined) out[i]!.amount_cents += p.amount_cents
    else {
      at.set(category, out.length)
      out.push({ category, amount_cents: p.amount_cents })
    }
  }
  return out.length >= MIN_PARTS ? out : null
}
