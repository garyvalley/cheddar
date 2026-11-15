// The review inbox (Spending's "Needs review") is for what arrives as the
// person uses Cheddar, not for the years of history a bank link brings in
// when it's made. A synced transaction posted more than REVIEW_DAYS before
// its link was made is history: it's kept, found by searches and counted in
// every total like any other, but waits outside the inbox (Spending offers
// it separately). Newer ones, and everything a later sync adds, go to the
// inbox as before.
//
// The sync (pb_hooks/glue/bank_links.js) marks it, from pb_hooks/lib/gen/review.js:
// this file, built for the hooks by scripts/gen-hooks.mjs. Pure: no Intl.

export const REVIEW_DAYS = 30

const DAY_MS = 86_400_000

/**
 * The first day (YYYY-MM-DD) whose transactions go to the inbox for a link
 * made at `linkedAt` (a PocketBase or ISO date, or YYYY-MM-DD); "" when it
 * can't be read, and then nothing is history.
 */
export function reviewFrom(linkedAt: string): string {
  const day = String(linkedAt || '').slice(0, 10)
  const at = Date.parse(`${day}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(at)) return ''
  return new Date(at - REVIEW_DAYS * DAY_MS).toISOString().slice(0, 10)
}

/** Whether a transaction posted on `posted` came in with the history of a link made at `linkedAt`. */
export function isHistory(posted: string, linkedAt: string): boolean {
  const from = reviewFrom(linkedAt)
  return !!from && /^\d{4}-\d{2}-\d{2}/.test(posted) && posted.slice(0, 10) < from
}
