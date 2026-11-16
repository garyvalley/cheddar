/**
 * Tags on transactions (issue #106): labels a person puts on a transaction
 * that cut across categories, like "Vacation 2026", "Tax-deductible" or
 * "Reimbursable". A transaction has a few; they're kept on it
 * (`transactions.tags`, a list of words, or null), and the owner and, on a
 * shared account, the household's members may change them, like its note.
 *
 * Built for the hooks too (scripts/gen-hooks.mjs): pb_hooks/tags.pb.js
 * checks every record-API write with checkTags(). Pure: no Intl or DOM.
 */

/** The longest a tag can be, in characters. */
export const TAG_MAX = 30
/** The most tags one transaction can have. */
export const TAGS_MAX = 10

// Letters (Latin, with accents), digits, spaces and a little punctuation:
// never a quote or backslash, so a tag can be searched for inside the
// stored list's JSON text.
const ALLOWED = /^[A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ &'+\-./]*$/

/** A tag as typed, tidied: spaces trimmed and run together. "" when there's nothing. */
export function cleanTag(input: unknown): string {
  return typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
}

/** Whether two tags are the same tag: case doesn't matter. */
export const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The problem with one tag, in words, or "" when it's fine. */
export function tagProblem(tag: string): string {
  if (!tag) return 'A tag needs a word in it.'
  if (tag.length > TAG_MAX) return `A tag can be at most ${TAG_MAX} characters.`
  if (!ALLOWED.test(tag)) return 'A tag starts with a letter or digit and uses only letters, digits, spaces and & \' + - . /'
  return ''
}

/**
 * A transaction's tags from what a person (or the record API) sends: a list
 * of words, or a comma-separated line. Each is tidied, the same tag twice is
 * kept once (the first spelling), and an empty list is null. Answers
 * { tags } or { problem } in words.
 */
export function checkTags(input: unknown): { tags: string[] | null } | { problem: string } {
  if (input === null || input === undefined || input === '') return { tags: null }
  const list = typeof input === 'string' ? input.split(',') : input
  if (!Array.isArray(list)) return { problem: 'Tags are a list of words.' }
  const out: string[] = []
  for (const raw of list) {
    if (typeof raw !== 'string') return { problem: 'Tags are a list of words.' }
    const tag = cleanTag(raw)
    if (!tag && typeof input === 'string') continue
    const problem = tagProblem(tag)
    if (problem) return { problem }
    if (!out.some(t => sameTag(t, tag))) out.push(tag)
  }
  if (out.length > TAGS_MAX) return { problem: `A transaction can have at most ${TAGS_MAX} tags.` }
  return { tags: out.length ? out : null }
}

/** The tags stored on a transaction, as a list (none for null or anything odd). */
export function tagsOf(stored: unknown): string[] {
  return Array.isArray(stored) ? stored.filter((t): t is string => typeof t === 'string' && !!t) : []
}

/** What one tag came to over some transactions. */
export interface TagTotal {
  tag: string
  count: number
  /** Money out, as a positive size. */
  out_cents: number
  /** Money in. */
  in_cents: number
}

/**
 * Each tag's total over `rows` (counted ones: the caller leaves out what
 * doesn't count), the most money out first, then by name. A tag spelled
 * two ways on two rows is one tag, under the spelling seen first. A split
 * transaction counts whole: a tag is on all of it.
 */
export function tagTotals(rows: { amount_cents: number, tags: string[] }[]): TagTotal[] {
  const byKey = new Map<string, TagTotal>()
  for (const r of rows) {
    for (const tag of r.tags) {
      const key = tag.toLowerCase()
      let t = byKey.get(key)
      if (!t) byKey.set(key, (t = { tag, count: 0, out_cents: 0, in_cents: 0 }))
      t.count++
      if (r.amount_cents < 0) t.out_cents -= r.amount_cents
      else t.in_cents += r.amount_cents
    }
  }
  return [...byKey.values()].sort((a, b) => b.out_cents - a.out_cents || a.tag.localeCompare(b.tag))
}

/** The search text that finds a tag inside a stored list's JSON. */
export const tagNeedle = (tag: string) => JSON.stringify(cleanTag(tag))
