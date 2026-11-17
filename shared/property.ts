/**
 * Home and car values that change at a yearly rate the person sets (issue
 * #113): a home that gains 3% a year, a car that loses 15%. Each day the
 * hooks move a property account's balance on from its last value
 * (pb_hooks/property.pb.js), so it doesn't go stale, and typing a new value
 * (an appraisal, a sale price) starts it again from there.
 *
 * Pure and built for the hooks (scripts/gen-hooks.mjs).
 */

/** The most a value may change in a year either way: 50%, in basis points. */
export const YEARLY_CHANGE_MAX_BP = 5000

/** The kinds of account whose value can change on its own. */
export const changesOnItsOwn = (kind: string) => kind === 'property'

/**
 * A yearly change as typed: a percent, "3" or "-15" or "2.5%", "" or 0 for
 * none. Answers basis points (300, -1500) or a problem in words.
 */
export function checkYearlyChange(input: unknown): { ok: number } | { problem: string } {
  if (input === null || input === undefined || input === '') return { ok: 0 }
  const text = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim().replace(/%$/, '').trim().replace('−', '-') : ''
  if (!/^[-+]?\d{1,2}(\.\d{1,2})?$/.test(text)) return { problem: 'Give the yearly change as a percent, like 3 or -15.' }
  const bp = Math.round(Number(text) * 100)
  if (Math.abs(bp) > YEARLY_CHANGE_MAX_BP) return { problem: 'A value can change at most 50% a year.' }
  return { ok: bp }
}

/** What `cents` comes to after `days` at `bp` a year, compounded: to the cent. */
export function valueAfter(cents: number, bp: number, days: number): number {
  if (!bp || days <= 0) return cents
  return Math.round(cents * (1 + bp / 10_000) ** (days / 365))
}

/** "Grows 3% a year", "Loses 15% a year", or "" for none. */
export function yearlyChangeWords(bp: number): string {
  if (!bp) return ''
  const pct = String(Math.abs(bp) / 100)
  return `${bp > 0 ? 'Grows' : 'Loses'} ${pct}% a year`
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}
