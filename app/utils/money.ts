/**
 * The colour of a signed amount: "gain" (green) above zero, "loss" (red)
 * below, nothing at zero. Pass it to :class; main.css colours .gain and
 * .loss the same in every theme.
 */
export const moneyTone = (cents: number): '' | 'gain' | 'loss' => (cents > 0 ? 'gain' : cents < 0 ? 'loss' : '')

/** Spending is shown as a positive amount, so it is red above zero and green below (a net refund). */
export const spendTone = (cents: number) => moneyTone(-cents)
