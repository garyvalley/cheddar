/** A linked account, as the bank-links routes describe it. */
export interface LinkedAccount {
  id: string
  name: string
  institution: string
  kind: string
  last4: string
  /** Signed: what a card or loan owes is negative. Null until the bank gives one. */
  balance_cents: number | null
  balance_date: string
}

/** One linked bank: the accounts one sign-in to that bank reaches, through Plaid. */
export interface BankLink {
  id: string
  provider: 'plaid'
  institutions: string[]
  /** ok; error (the last sync failed, the next may work); reconnect (sign in to the bank again). */
  status: 'ok' | 'error' | 'reconnect'
  /** What went wrong, as the person should read it; '' when all is well. */
  message: string
  /** PocketBase's date format, or '' before the first sync worked. */
  last_synced: string
  accounts: LinkedAccount[]
}

export interface BankLinks {
  /** Whether this Cheddar can link banks (BANK_LINK_KEY and the Plaid keys are set). */
  enabled: boolean
  links: BankLink[]
}

/** What a sync did. `recent`: it had just synced, so this one didn't ask Plaid again. */
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
