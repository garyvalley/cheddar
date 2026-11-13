/**
 * The Taxes page's federal estimate and ideas, worked out only from what the
 * accounts hold: income and tax payments from their categorized transactions
 * (shared/categories.ts), money moved into retirement accounts, and what kinds
 * of account the person has. Pure, so the unit tests and the page use the
 * same sums.
 *
 * Figures are kept per tax year in FEDERAL, each with its IRS sources. Add
 * the next year's each autumn when the IRS publishes them.
 */
import type { FilingStatus } from './filing-status.ts'

/** One tax year's federal figures. */
export interface FederalTable {
  /** Where each rate stops, in dollars of taxable income; the last runs on without end. */
  tops: Record<FilingStatus, number[]>
  standardDeduction: Record<FilingStatus, number>
  /** Taxable income up to which long-term gains and qualified dividends are taxed at 0%. */
  zeroGainsTop: Record<FilingStatus, number>
  /** What a person can put in each kind of tax-advantaged account that year, in dollars. */
  limits: {
    k401: number
    k401_catch_up: number
    k401_catch_up_60_63: number
    ira: number
    ira_catch_up: number
    hsa_self: number
    hsa_family: number
  }
  /** Cash gifts to charity a person can deduct without itemizing, in dollars (from 2026). */
  charityNoItemize: Record<FilingStatus, number>
}

/**
 * Federal figures by tax year; state ones are shared/state-taxes.ts's. Add next year's each autumn, once the IRS
 * publishes them (tests/taxes.test.mjs fails from February of a year with
 * no table). A year without one uses the newest year before it, and the
 * page says so.
 */
export const FEDERAL: Record<number, FederalTable> = {
  // Rev. Proc. 2024-40, with the standard deduction as the One Big Beautiful
  // Bill Act raised it; Notice 2024-80 (401(k), IRA), Rev. Proc. 2024-25 (HSA).
  2025: {
    tops: {
      single: [11_925, 48_475, 103_350, 197_300, 250_525, 626_350],
      married_joint: [23_850, 96_950, 206_700, 394_600, 501_050, 751_600],
      married_separate: [11_925, 48_475, 103_350, 197_300, 250_525, 375_800],
      head_of_household: [17_000, 64_850, 103_350, 197_300, 250_500, 626_350],
      qualifying_surviving_spouse: [23_850, 96_950, 206_700, 394_600, 501_050, 751_600],
    },
    standardDeduction: {
      single: 15_750,
      married_joint: 31_500,
      married_separate: 15_750,
      head_of_household: 23_625,
      qualifying_surviving_spouse: 31_500,
    },
    zeroGainsTop: {
      single: 48_350,
      married_joint: 96_700,
      married_separate: 48_350,
      head_of_household: 64_750,
      qualifying_surviving_spouse: 96_700,
    },
    limits: {
      k401: 23_500,
      k401_catch_up: 7_500,
      k401_catch_up_60_63: 11_250,
      ira: 7_000,
      ira_catch_up: 1_000,
      hsa_self: 4_300,
      hsa_family: 8_550,
    },
    // The deduction without itemizing starts in 2026.
    charityNoItemize: {
      single: 0,
      married_joint: 0,
      married_separate: 0,
      head_of_household: 0,
      qualifying_surviving_spouse: 0,
    },
  },
  // Rev. Proc. 2025-32, Notice 2025-67 (401(k), IRA), Rev. Proc. 2025-19 (HSA).
  2026: {
    tops: {
      single: [12_400, 50_400, 105_700, 201_775, 256_225, 640_600],
      married_joint: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700],
      married_separate: [12_400, 50_400, 105_700, 201_775, 256_225, 384_350],
      head_of_household: [17_700, 67_450, 105_700, 201_775, 256_225, 640_600],
      qualifying_surviving_spouse: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700],
    },
    standardDeduction: {
      single: 16_100,
      married_joint: 32_200,
      married_separate: 16_100,
      head_of_household: 24_150,
      qualifying_surviving_spouse: 32_200,
    },
    zeroGainsTop: {
      single: 49_450,
      married_joint: 98_900,
      married_separate: 49_450,
      head_of_household: 66_200,
      qualifying_surviving_spouse: 98_900,
    },
    limits: {
      k401: 24_500,
      k401_catch_up: 8_000,
      k401_catch_up_60_63: 11_250,
      ira: 7_500,
      ira_catch_up: 1_100,
      hsa_self: 4_400,
      hsa_family: 8_750,
    },
    charityNoItemize: {
      single: 1_000,
      married_joint: 2_000,
      married_separate: 1_000,
      head_of_household: 1_000,
      qualifying_surviving_spouse: 1_000,
    },
  },
}

const RATES = [10, 12, 22, 24, 32, 35, 37]

/** The newest year Cheddar has federal figures for. */
export const NEWEST_TAX_YEAR = Math.max(...Object.keys(FEDERAL).map(Number))

/** The figures for `year`: its own, or the newest year's before it (`table_year` says which). */
export function federalFor(year: number): FederalTable & { table_year: number } {
  const years = Object.keys(FEDERAL).map(Number).sort((a, b) => b - a)
  const table_year = years.find(y => y <= year) ?? years.at(-1)!
  return { ...FEDERAL[table_year]!, table_year }
}

/**
 * The tax year Taxes shows first on `today`: last year's from January 1 to
 * April 15, while its return is being filed, then this year's.
 */
export function defaultTaxYear(today: string): number {
  const year = Number(today.slice(0, 4))
  return today.slice(5) <= '04-15' ? year - 1 : year
}

/** The years Taxes offers: this year and last. */
export const taxYearsOn = (today: string) => [Number(today.slice(0, 4)), Number(today.slice(0, 4)) - 1]

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

export function brackets(status: FilingStatus, year = NEWEST_TAX_YEAR): { rate: number, from_cents: number, to_cents: number | null }[] {
  const tops = federalFor(year).tops[status]
  return RATES.map((rate, i) => ({
    rate,
    from_cents: i === 0 ? 0 : tops[i - 1]! * 100,
    to_cents: i < tops.length ? tops[i]! * 100 : null,
  }))
}

export interface Estimate {
  status: FilingStatus
  /** The tax year, and the year whose figures were used for it. */
  year: number
  table_year: number
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
export function estimate(incomeCents: number, status: FilingStatus, year = NEWEST_TAX_YEAR): Estimate {
  const table = federalFor(year)
  const income = Math.max(0, Math.round(incomeCents))
  const deduction = table.standardDeduction[status] * 100
  const taxable = Math.max(0, income - deduction)
  let tax = 0
  let marginal = RATES[0]!
  let toNext: number | null = null
  let inTop = 0
  const out: Bracket[] = brackets(status, year).map((b) => {
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
    year,
    table_year: table.table_year,
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
 * A tax year from the person's transactions and accounts: this year so far,
 * or a past `year` whole. `first` is the earliest transaction Cheddar has for
 * them at all, so a person who started importing in June isn't read as
 * earning nothing until then.
 */
export function taxYear(
  rows: { account: string, posted: string, amount_cents: number, category: string }[],
  accounts: { id: string, kind: string }[],
  today: string,
  first: string,
  year = Number(today.slice(0, 4)),
): TaxYear {
  const jan1 = `${year}-01-01`
  const end = `${year}-12-31` < today ? `${year}-12-31` : today
  const from = first && first > jan1 && first <= end ? first : jan1
  const retirement = new Set(accounts.filter(a => a.kind === 'retirement').map(a => a.id))
  let income = 0
  let paid = 0
  let moved = 0
  let health = 0
  let gifts = 0
  for (const r of rows) {
    if (r.posted < jan1 || r.posted > end) continue
    if (r.category === 'income') income += r.amount_cents
    else if (r.category === 'taxes') paid -= r.amount_cents
    else if (r.category === 'health') health -= r.amount_cents
    else if (r.category === 'gifts') gifts -= r.amount_cents
    else if (r.category === 'transfer' && retirement.has(r.account)) moved += r.amount_cents
  }
  return {
    year,
    from,
    to: end,
    income_cents: income,
    tax_paid_cents: paid,
    retirement_in_cents: moved,
    health_cents: health,
    gifts_cents: gifts,
    projected_income_cents: projectIncome(income, from, end),
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

/**
 * Ideas for paying less, each only where the person's own figures make it
 * worth saying. `stateMarginal` is the state's rate on the next dollar
 * (shared/state-taxes.ts), 0 where there's no state income tax.
 */
export function ideas(est: Estimate, ty: TaxYear, stateName: string, stateMarginal: number): Idea[] {
  const out: Idea[] = []
  const s = est.status
  const { limits: LIMITS, zeroGainsTop: ZERO_GAINS_TOP, charityNoItemize: CHARITY_NO_ITEMIZE } = federalFor(est.year)
  if (!est.income_cents) return out
  if (est.marginal >= 22) {
    out.push({
      id: 'pre-tax',
      title: 'Save before tax',
      body: `Your next dollars are taxed at ${est.marginal}%, so each $1,000 put into a traditional 401(k) or IRA cuts ${est.year}'s federal tax by about ${dollars(est.marginal * 1000)}${stateMarginal > 0 ? `, and ${stateName}'s by about ${dollars(stateMarginal * 1000)}` : ''}. You can put up to ${dollars(LIMITS.k401 * 100)} into a 401(k) and ${dollars(LIMITS.ira * 100)} into an IRA for ${est.year}.`,
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
      body: `At ${est.marginal}%, you pay little tax on what you put in a Roth IRA or Roth 401(k) now, and nothing when you take it out in retirement. You can put up to ${dollars(LIMITS.ira * 100)} into an IRA for ${est.year}.`,
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
      body: `You've spent ${dollars(ty.health_cents)} on health in ${est.year}. With a high-deductible health plan, an HSA takes up to ${dollars(LIMITS.hsa_self * 100)} (${dollars(LIMITS.hsa_family * 100)} for a family) before tax, and pays medical bills tax-free.`,
    })
  }
  if (ty.gifts_cents > 0 && CHARITY_NO_ITEMIZE[s] > 0) {
    out.push({
      id: 'charity',
      title: 'Deduct gifts to charity',
      body: `From 2026, you can deduct up to ${dollars(CHARITY_NO_ITEMIZE[s] * 100)} of cash gifts to charity without itemizing${isJoint(s) ? ' on a joint return' : ''}. Keep the receipts for what you gave.`,
    })
  }
  return out
}
