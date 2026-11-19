/**
 * The colour of a signed amount: "gain" (green) above zero, "loss" (red)
 * below, nothing at zero. Pass it to :class; main.css colours .gain and
 * .loss the same in every theme.
 */
export const moneyTone = (cents: number): '' | 'gain' | 'loss' => (cents > 0 ? 'gain' : cents < 0 ? 'loss' : '')

/** Spending is shown as a positive amount, so it is red above zero and green below (a net refund). */
export const spendTone = (cents: number) => moneyTone(-cents)

/** An amount in short form for a chart's axis or centre: "$1.2K", "$35". */
export const compactCents = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)

/** A month (YYYY-MM) as "November 2026". */
export const monthName = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
