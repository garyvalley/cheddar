/**
 * Matching transfers and refunds (issue #110). A transfer between two of a
 * person's own accounts shows up twice, money out of one and the same
 * amount into the other; a refund comes back from the merchant it was
 * spent at. Matched, they're linked to each other (`transactions.link`,
 * `link_kind`): a transfer pair is sorted as Transfers on both sides, and a
 * refund into its purchase's category, so neither counts as spending or
 * income by mistake.
 *
 * Pure, and built for the hooks (scripts/gen-hooks.mjs): the hooks find the
 * candidates (pb_hooks/glue/links.js) and these pick the one that matches.
 */

/** How many days apart the two sides of a transfer may be posted. */
export const TRANSFER_DAYS = 4
/** How long after a purchase its refund may come. */
export const REFUND_DAYS = 120

export type LinkKind = 'transfer' | 'refund'

export interface LinkRow {
  id: string
  owner: string
  account: string
  posted: string
  amount_cents: number
  merchant_key: string
  category: string
  category_by: string
  pending: boolean
  excluded: boolean
  /** Already linked to another. */
  link: string
  /** The person unlinked it: never matched again on its own. */
  link_off: boolean
}

const day = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / 86_400_000

/** Days from `a` to `b`, either way. */
export const daysApart = (a: string, b: string) => Math.abs(day(a) - day(b))

/** Whether a row may be matched at all. */
export function matchable(r: LinkRow): boolean {
  return !r.link && !r.link_off && !r.pending && !r.excluded && r.amount_cents !== 0
}

/**
 * The other side of a transfer for `row`, from `candidates` (the owner's
 * other rows of the opposite amount near its date): in another of the
 * owner's accounts, posted at most TRANSFER_DAYS apart, the nearest first.
 * A side the person sorted by hand into anything but Transfers is left
 * alone, and so is a pair of rows that are both spending or both income in
 * the eyes of the person's own choices. Answers its id, or "".
 */
export function transferFor(row: LinkRow, candidates: LinkRow[]): string {
  if (!matchable(row) || handPicked(row)) return ''
  const fits = candidates.filter(c =>
    c.id !== row.id
    && c.owner === row.owner
    && c.account !== row.account
    && c.amount_cents === -row.amount_cents
    && matchable(c)
    && !handPicked(c)
    && daysApart(c.posted, row.posted) <= TRANSFER_DAYS)
  fits.sort((a, b) => daysApart(a.posted, row.posted) - daysApart(b.posted, row.posted) || (a.id < b.id ? -1 : 1))
  return fits[0]?.id ?? ''
}

/** Sorted by hand into something other than Transfers. */
const handPicked = (r: LinkRow) => r.category_by === 'person' && r.category !== 'transfer'

/**
 * The purchase a refund (money in, `row`) reverses, from `candidates`: at
 * the same merchant in the same account, money out of at least the
 * refund's size, posted on or before it and at most REFUND_DAYS earlier, in
 * a spending category (`spending` says which are). An exact amount wins,
 * then the latest. Answers its id, or "".
 */
export function refundFor(row: LinkRow, candidates: LinkRow[], spending: (category: string) => boolean): string {
  if (!matchable(row) || row.amount_cents <= 0 || !row.merchant_key) return ''
  const fits = candidates.filter(c =>
    c.id !== row.id
    && c.owner === row.owner
    && c.account === row.account
    && c.merchant_key === row.merchant_key
    && c.amount_cents < 0
    && -c.amount_cents >= row.amount_cents
    && matchable(c)
    && spending(c.category)
    && c.posted <= row.posted
    && daysApart(c.posted, row.posted) <= REFUND_DAYS)
  fits.sort((a, b) =>
    Number(-b.amount_cents === row.amount_cents) - Number(-a.amount_cents === row.amount_cents)
    || (a.posted < b.posted ? 1 : a.posted > b.posted ? -1 : 0)
    || (a.id < b.id ? -1 : 1))
  return fits[0]?.id ?? ''
}

/** What the person is told about a linked row, from its partner. */
export function linkWords(kind: LinkKind | '', self: { amount_cents: number }, other: { posted: string, account_name: string } | null): string {
  if (!kind) return ''
  if (kind === 'transfer') {
    const where = other ? ` ${self.amount_cents < 0 ? 'to' : 'from'} ${other.account_name}` : ''
    return `Transfer${where}`
  }
  if (self.amount_cents > 0) return other ? `Refund of a purchase on ${other.posted}` : 'Refund of a purchase'
  return other ? `Refunded on ${other.posted}` : 'Refunded'
}
