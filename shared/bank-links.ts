/** A linked account, as the bank-links routes describe it. */
export interface LinkedAccount {
  id: string
  name: string
  institution: string
  kind: string
  /** Signed: what a card or loan owes is negative. Null until SimpleFIN gives one. */
  balance_cents: number | null
  balance_date: string
}

/** One SimpleFIN link: the institutions behind one setup token. */
export interface BankLink {
  id: string
  provider: 'simplefin'
  institutions: string[]
  /** ok; error (the last sync failed, the next may work); reconnect (link again with a new token). */
  status: 'ok' | 'error' | 'reconnect'
  /** What went wrong, or what SimpleFIN said about an institution; '' when all is well. */
  message: string
  /** PocketBase's date format, or '' before the first sync worked. */
  last_synced: string
  accounts: LinkedAccount[]
}

export interface BankLinks {
  /** Whether this Cheddar can link banks (BANK_LINK_KEY is set). */
  enabled: boolean
  links: BankLink[]
}

/** What a sync did. `recent`: it had just synced, so this one didn't ask SimpleFIN again. */
export interface SyncResult {
  ok: boolean
  added: number
  updated: number
  removed: number
  problem?: string
  recent?: boolean
}

export interface LinkAnswer {
  link: BankLink
  sync: SyncResult
}

/** Money for a row: "$1,234.56", "−$80.00". */
export function formatCents(cents: number | null, currency = 'USD'): string {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100).replace('-', '−')
}
