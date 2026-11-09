/**
 * The Taxes page's federal estimate and ideas, worked out only from what the
 * accounts hold: income and tax payments from their categorized transactions
 * (shared/categories.ts), money moved into retirement accounts, and what kinds
 * of account the person has. Pure, so the unit tests and the page use the
 * same sums.
 *
 * Figures are for tax year 2026: IRS Rev. Proc. 2025-32 (brackets, standard
 * deduction, long-term capital gains), Notice 2025-67 (401(k), IRA) and
 * Rev. Proc. 2025-19 (HSA). Update them together each autumn when the IRS
 * publishes the next year's.
 */
import type { FilingStatus } from './filing-status.ts'

export const TAX_YEAR = 2026

/** Where each rate stops, in dollars of taxable income; the last runs on without end. */
const TOPS: Record<FilingStatus, number[]> = {
  single: [12_400, 50_400, 105_700, 201_775, 256_225, 640_600],
  married_joint: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700],
  married_separate: [12_400, 50_400, 105_700, 201_775, 256_225, 384_350],
  head_of_household: [17_700, 67_450, 105_700, 201_775, 256_225, 640_600],
  qualifying_surviving_spouse: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700],
}
const RATES = [10, 12, 22, 24, 32, 35, 37]

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 16_100,
  married_joint: 32_200,
  married_separate: 16_100,
  head_of_household: 24_150,
  qualifying_surviving_spouse: 32_200,
}

/** Taxable income up to which long-term gains and qualified dividends are taxed at 0%. */
export const ZERO_GAINS_TOP: Record<FilingStatus, number> = {
  single: 49_450,
  married_joint: 98_900,
  married_separate: 49_450,
  head_of_household: 66_200,
  qualifying_surviving_spouse: 98_900,
}

/** What a person can put in each kind of tax-advantaged account this year, in dollars. */
export const LIMITS = {
  k401: 24_500,
  k401_catch_up: 8_000,
  k401_catch_up_60_63: 11_250,
  ira: 7_500,
  ira_catch_up: 1_100,
  hsa_self: 4_400,
  hsa_family: 8_750,
}

/** Cash gifts to charity a person can deduct from 2026 without itemizing, in dollars. */
export const CHARITY_NO_ITEMIZE: Record<FilingStatus, number> = {
  single: 1_000,
  married_joint: 2_000,
  married_separate: 1_000,
  head_of_household: 1_000,
  qualifying_surviving_spouse: 1_000,
}

const isJoint = (s: FilingStatus) => s === 'married_joint' || s === 'qualifying_surviving_spouse'

export interface Bracket {
  rate: number
  /** Taxable income where the rate starts and stops, in cents; null is no end. */
  from_cents: number
  to_cents: number | null
  /** How much of the income falls in it, and the tax on that. */
  taxed_cents: number
  tax_cents: number
}

export function brackets(status: FilingStatus): { rate: number, from_cents: number, to_cents: number | null }[] {
  const tops = TOPS[status]
  return RATES.map((rate, i) => ({
    rate,
    from_cents: i === 0 ? 0 : tops[i - 1]! * 100,
    to_cents: i < tops.length ? tops[i]! * 100 : null,
  }))
}

export interface Estimate {
  status: FilingStatus
  income_cents: number
  deduction_cents: number
  taxable_cents: number
  tax_cents: number
  /** Tax ÷ income, as a fraction. */
  effective: number
  /** The rate the next dollar is taxed at, as a percent. */
  marginal: number
  /** Taxable income left before the next rate starts; null in the top bracket. */
  to_next_cents: number | null
  /** Income taxed at the marginal rate: what pre-tax savings would bring down a bracket. */
  in_top_cents: number
  brackets: Bracket[]
}

/** Federal income tax on a year's income, with the standard deduction. */
export function estimate(incomeCents: number, status: FilingStatus): Estimate {
  const income = Math.max(0, Math.round(incomeCents))
  const deduction = STANDARD_DEDUCTION[status] * 100
  const taxable = Math.max(0, income - deduction)
  let tax = 0
  let marginal = RATES[0]!
  let toNext: number | null = null
  let inTop = 0
  const out: Bracket[] = brackets(status).map((b) => {
    const top = b.to_cents ?? Infinity
    const taxed = Math.max(0, Math.min(taxable, top) - b.from_cents)
    const t = Math.round(taxed * b.rate / 100)
    tax += t
    if (taxable >= b.from_cents && (taxable < top || b.to_cents === null)) {
      marginal = b.rate
      toNext = b.to_cents === null ? null : b.to_cents - taxable
      inTop = taxed
    }
    return { ...b, taxed_cents: taxed, tax_cents: t }
  })
  return {
    status,
    income_cents: income,
    deduction_cents: deduction,
    taxable_cents: taxable,
    tax_cents: tax,
    effective: income ? tax / income : 0,
    marginal,
    to_next_cents: toNext,
    in_top_cents: inTop,
    brackets: out,
  }
}

/** What the accounts show of the tax year so far. */
export interface TaxYear {
  year: number
  /** The day the figures run from: January 1, or the first transaction Cheddar has after it. */
  from: string
  to: string
  /** Money in categorized as income. Deposits are take-home pay, after withholding. */
  income_cents: number
  /** Money out categorized as taxes: estimated payments, a balance due. */
  tax_paid_cents: number
  /** Money moved into retirement accounts (transfers in, less transfers out). */
  retirement_in_cents: number
  /** Spent on health, and on gifts and donations. */
  health_cents: number
  gifts_cents: number
  /** Income at this pace for the whole year; null with too few weeks to tell. */
  projected_income_cents: number | null
  has_brokerage: boolean
  has_retirement: boolean
}

const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000

/** The year's income at the pace it has come in from `from` to `to`, once that's at least four weeks. */
export function projectIncome(incomeCents: number, from: string, to: string): number | null {
  const year = from.slice(0, 4)
  const days = dayNumber(to) - dayNumber(from) + 1
  if (days < 28) return null
  const inYear = dayNumber(`${year}-12-31`) - dayNumber(`${year}-01-01`) + 1
  return days >= inYear ? incomeCents : Math.round(incomeCents * inYear / days)
}

/**
 * The tax year so far from the person's transactions and accounts. `first`
 * is the earliest transaction Cheddar has for them at all, so a person who
 * started importing in June isn't read as earning nothing until then.
 */
export function taxYear(
  rows: { account: string, posted: string, amount_cents: number, category: string }[],
  accounts: { id: string, kind: string }[],
  today: string,
  first: string,
): TaxYear {
  const year = Number(today.slice(0, 4))
  const jan1 = `${year}-01-01`
  const from = first && first > jan1 && first <= today ? first : jan1
  const retirement = new Set(accounts.filter(a => a.kind === 'retirement').map(a => a.id))
  let income = 0
  let paid = 0
  let moved = 0
  let health = 0
  let gifts = 0
  for (const r of rows) {
    if (r.posted < jan1 || r.posted > today) continue
    if (r.category === 'income') income += r.amount_cents
    else if (r.category === 'taxes') paid -= r.amount_cents
    else if (r.category === 'health') health -= r.amount_cents
    else if (r.category === 'gifts') gifts -= r.amount_cents
    else if (r.category === 'transfer' && retirement.has(r.account)) moved += r.amount_cents
  }
  return {
    year,
    from,
    to: today,
    income_cents: income,
    tax_paid_cents: paid,
    retirement_in_cents: moved,
    health_cents: health,
    gifts_cents: gifts,
    projected_income_cents: projectIncome(income, from, today),
    has_brokerage: accounts.some(a => a.kind === 'brokerage'),
    has_retirement: retirement.size > 0,
  }
}

export interface Idea {
  id: string
  title: string
  body: string
}

const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(cents / 100))

/** Ideas for paying less, each only where the person's own figures make it worth saying. */
export function ideas(est: Estimate, ty: TaxYear, stateName: string, stateTaxes: boolean): Idea[] {
  const out: Idea[] = []
  const s = est.status
  if (!est.income_cents) return out
  if (est.marginal >= 22) {
    out.push({
      id: 'pre-tax',
      title: 'Save before tax',
      body: `Your next dollars are taxed at ${est.marginal}%, so each $1,000 put into a traditional 401(k) or IRA cuts this year's federal tax by about ${dollars(est.marginal * 1000)}${stateTaxes ? `, and usually ${stateName}'s too` : ''}. You can put up to ${dollars(LIMITS.k401 * 100)} into a 401(k) and ${dollars(LIMITS.ira * 100)} into an IRA this year.`,
    })
    const lower = RATES[RATES.indexOf(est.marginal) - 1]
    if (lower && est.in_top_cents > 0 && est.in_top_cents <= (LIMITS.k401 + LIMITS.ira) * 100) {
      out.push({
        id: 'bracket',
        title: `Bring it all down to ${lower}%`,
        body: `Only ${dollars(est.in_top_cents)} of your income reaches the ${est.marginal}% bracket. Saving that much before tax would keep every dollar at ${lower}% or less.`,
      })
    }
  }
  else {
    out.push({
      id: 'roth',
      title: 'Roth is likely the better deal',
      body: `At ${est.marginal}%, you pay little tax on what you put in a Roth IRA or Roth 401(k) now, and nothing when you take it out in retirement. You can put up to ${dollars(LIMITS.ira * 100)} into an IRA this year.`,
    })
  }
  const zeroRoom = ZERO_GAINS_TOP[s] * 100 - est.taxable_cents
  if (ty.has_brokerage && zeroRoom > 0) {
    out.push({
      id: 'zero-gains',
      title: 'Take gains at 0%',
      body: `With your taxable income under ${dollars(ZERO_GAINS_TOP[s] * 100)}, up to ${dollars(zeroRoom)} of gains on investments held over a year are taxed at 0%. Selling and buying back resets their cost higher, so later gains are smaller.`,
    })
  }
  if (ty.health_cents > 0) {
    out.push({
      id: 'hsa',
      title: 'Pay health costs before tax',
      body: `You've spent ${dollars(ty.health_cents)} on health this year. With a high-deductible health plan, an HSA takes up to ${dollars(LIMITS.hsa_self * 100)} (${dollars(LIMITS.hsa_family * 100)} for a family) before tax, and pays medical bills tax-free.`,
    })
  }
  if (ty.gifts_cents > 0) {
    out.push({
      id: 'charity',
      title: 'Deduct gifts to charity',
      body: `From ${TAX_YEAR}, you can deduct up to ${dollars(CHARITY_NO_ITEMIZE[s] * 100)} of cash gifts to charity without itemizing${isJoint(s) ? ' on a joint return' : ''}. Keep the receipts for what you gave.`,
    })
  }
  return out
}
