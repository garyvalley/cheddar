/**
 * The Taxes page's state income tax estimate, for every state that taxes
 * wages (shared/states.ts `incomeTax`). Pure, so the unit tests and the page
 * use the same sums.
 *
 * Figures are Tax Foundation's "State Individual Income Tax Rates and
 * Brackets, 2026" (as of January 1, 2026), which in turn are each state's
 * published 2026 figures, or its 2025 ones where a state hadn't yet indexed
 * them. Update them together each year, alongside shared/taxes.ts.
 *
 * It's a sketch, not a return: it starts from the year's income, takes the
 * state's standard deduction and personal exemption (or credit), and taxes the
 * rest by the state's brackets. Left out: local income taxes (county and city
 * taxes in MD, NY, OH, PA, IN and others), phase-outs of deductions and
 * exemptions at high incomes, "benefit recapture" in CT and NY, Vermont's
 * minimum tax, dependents, and credits. Head of household and married filing
 * separately use the single schedule; a qualifying surviving spouse the joint.
 */
import type { FilingStatus } from './filing-status.ts'

/** [rate in percent, the taxable income in dollars where it starts]; below the first start, nothing is taxed. */
type Schedule = [number, number][]

export interface StateTax {
  single: Schedule
  joint: Schedule
  /** Standard deduction in dollars, [single, joint]; 0 where there is none. */
  deduction: [number, number]
  /** Personal exemption in dollars, [single, joint]; 0 where there is none. */
  exemption: [number, number]
  /** The exemption, or the standard deduction, is taken off the tax as a credit rather than off income. */
  exemptionCredit?: true
  deductionCredit?: true
  /** Federal income tax paid is deducted from state taxable income (Alabama). */
  federalDeductible?: true
}

const flat = (rate: number, from = 0): Schedule => [[rate, from]]

export const STATE_TAX: Record<string, StateTax> = {
  AL: { single: [[2, 0], [4, 500], [5, 3000]], joint: [[2, 0], [4, 1000], [5, 6000]], deduction: [3000, 8500], exemption: [1500, 3000], federalDeductible: true },
  AZ: { single: flat(2.5), joint: flat(2.5), deduction: [8350, 16700], exemption: [0, 0] },
  AR: { single: [[2, 0], [3.9, 4600]], joint: [[2, 0], [3.9, 4600]], deduction: [2470, 4940], exemption: [29, 58], exemptionCredit: true },
  CA: {
    single: [[1, 0], [2, 11079], [4, 26264], [6, 41452], [8, 57542], [9.3, 72724], [10.3, 371479], [11.3, 445771], [12.3, 742953], [13.3, 1000000]],
    joint: [[1, 0], [2, 22158], [4, 52528], [6, 82904], [8, 115084], [9.3, 145448], [10.3, 742958], [11.3, 891542], [12.3, 1000000], [13.3, 1485906]],
    deduction: [5540, 11080],
    exemption: [153, 306],
    exemptionCredit: true,
  },
  CO: { single: flat(4.4), joint: flat(4.4), deduction: [16100, 32200], exemption: [0, 0] },
  CT: {
    single: [[2, 0], [4.5, 10000], [5.5, 50000], [6, 100000], [6.5, 200000], [6.9, 250000], [6.99, 500000]],
    joint: [[2, 0], [4.5, 20000], [5.5, 100000], [6, 200000], [6.5, 400000], [6.9, 500000], [6.99, 1000000]],
    deduction: [0, 0],
    exemption: [15000, 24000],
  },
  DE: {
    single: [[2.2, 2000], [3.9, 5000], [4.8, 10000], [5.2, 20000], [5.55, 25000], [6.6, 60000]],
    joint: [[2.2, 2000], [3.9, 5000], [4.8, 10000], [5.2, 20000], [5.55, 25000], [6.6, 60000]],
    deduction: [3250, 6500],
    exemption: [110, 220],
    exemptionCredit: true,
  },
  DC: {
    single: [[4, 0], [6, 10000], [6.5, 40000], [8.5, 60000], [9.25, 250000], [9.75, 500000], [10.75, 1000000]],
    joint: [[4, 0], [6, 10000], [6.5, 40000], [8.5, 60000], [9.25, 250000], [9.75, 500000], [10.75, 1000000]],
    deduction: [16100, 32200],
    exemption: [0, 0],
  },
  GA: { single: flat(5.19), joint: flat(5.19), deduction: [12000, 24000], exemption: [0, 0] },
  HI: {
    single: [[1.4, 0], [3.2, 9600], [5.5, 14400], [6.4, 19200], [6.8, 24000], [7.2, 36000], [7.6, 48000], [7.9, 125000], [8.25, 175000], [9, 225000], [10, 275000], [11, 325000]],
    joint: [[1.4, 0], [3.2, 19200], [5.5, 28800], [6.4, 38400], [6.8, 48000], [7.2, 72000], [7.6, 96000], [7.9, 250000], [8.25, 350000], [9, 450000], [10, 550000], [11, 650000]],
    deduction: [4400, 8800],
    exemption: [1144, 2288],
  },
  ID: { single: flat(5.3, 4811), joint: flat(5.3, 9622), deduction: [16100, 32200], exemption: [0, 0] },
  IL: { single: flat(4.95), joint: flat(4.95), deduction: [0, 0], exemption: [2925, 5850] },
  IN: { single: flat(2.95), joint: flat(2.95), deduction: [0, 0], exemption: [1000, 2000] },
  IA: { single: flat(3.8), joint: flat(3.8), deduction: [16100, 32200], exemption: [40, 80], exemptionCredit: true },
  KS: { single: [[5.2, 0], [5.58, 23000]], joint: [[5.2, 0], [5.58, 46000]], deduction: [3605, 8240], exemption: [9160, 18320] },
  KY: { single: flat(3.5), joint: flat(3.5), deduction: [3360, 3360], exemption: [0, 0] },
  LA: { single: flat(3), joint: flat(3), deduction: [12875, 25750], exemption: [0, 0] },
  ME: {
    single: [[5.8, 0], [6.75, 27399], [7.15, 64849]],
    joint: [[5.8, 0], [6.75, 54849], [7.15, 129749]],
    deduction: [8350, 16700],
    exemption: [5300, 10600],
  },
  MD: {
    single: [[2, 0], [3, 1000], [4, 2000], [4.75, 3000], [5, 100000], [5.25, 125000], [5.5, 150000], [5.75, 250000], [6.25, 500000], [6.5, 1000000]],
    joint: [[2, 0], [3, 1000], [4, 2000], [4.75, 3000], [5, 150000], [5.25, 175000], [5.5, 225000], [5.75, 300000], [6.25, 600000], [6.5, 1200000]],
    deduction: [3350, 6700],
    exemption: [3200, 6400],
  },
  MA: { single: [[5, 0], [9, 1083150]], joint: [[5, 0], [9, 1083150]], deduction: [0, 0], exemption: [4400, 8800] },
  MI: { single: flat(4.25), joint: flat(4.25), deduction: [0, 0], exemption: [5900, 11800] },
  MN: {
    single: [[5.35, 0], [6.8, 33310], [7.85, 109430], [9.85, 203150]],
    joint: [[5.35, 0], [6.8, 48700], [7.85, 193480], [9.85, 337930]],
    deduction: [15300, 30600],
    exemption: [0, 0],
  },
  MS: { single: flat(4, 10000), joint: flat(4, 10000), deduction: [2300, 4600], exemption: [6000, 12000] },
  MO: {
    single: [[2, 1348], [2.5, 2696], [3, 4044], [3.5, 5392], [4, 6740], [4.5, 8088], [4.7, 9436]],
    joint: [[2, 1348], [2.5, 2696], [3, 4044], [3.5, 5392], [4, 6740], [4.5, 8088], [4.7, 9436]],
    deduction: [16100, 32200],
    exemption: [0, 0],
  },
  MT: { single: [[4.7, 0], [5.65, 47500]], joint: [[4.7, 0], [5.65, 95000]], deduction: [16100, 32200], exemption: [0, 0] },
  NE: {
    single: [[2.46, 0], [3.51, 4130], [4.55, 24760]],
    joint: [[2.46, 0], [3.51, 8250], [4.55, 49530]],
    deduction: [8850, 17700],
    exemption: [176, 352],
    exemptionCredit: true,
  },
  NJ: {
    single: [[1.4, 0], [1.75, 20000], [3.5, 35000], [5.53, 40000], [6.37, 75000], [8.97, 500000], [10.75, 1000000]],
    joint: [[1.4, 0], [1.75, 20000], [2.45, 50000], [3.5, 70000], [5.53, 80000], [6.37, 150000], [8.97, 500000], [10.75, 1000000]],
    deduction: [0, 0],
    exemption: [1000, 2000],
  },
  NM: {
    single: [[1.5, 0], [3.2, 5500], [4.3, 16500], [4.7, 33500], [4.9, 66500], [5.9, 210000]],
    joint: [[1.5, 0], [3.2, 8000], [4.3, 25000], [4.7, 50000], [4.9, 100000], [5.9, 315000]],
    deduction: [16100, 32200],
    exemption: [0, 0],
  },
  NY: {
    single: [[3.9, 0], [4.4, 8500], [5.15, 11700], [5.4, 13900], [5.9, 80650], [6.85, 215400], [9.65, 1077550], [10.3, 5000000], [10.9, 25000000]],
    joint: [[3.9, 0], [4.4, 17150], [5.15, 23600], [5.4, 27900], [5.9, 161550], [6.85, 323200], [9.65, 2155350], [10.3, 5000000], [10.9, 25000000]],
    deduction: [8000, 16050],
    exemption: [0, 0],
  },
  NC: { single: flat(3.99), joint: flat(3.99), deduction: [12750, 25500], exemption: [0, 0] },
  ND: { single: [[1.95, 48475], [2.5, 244825]], joint: [[1.95, 80975], [2.5, 298075]], deduction: [16100, 32200], exemption: [0, 0] },
  OH: { single: flat(2.75, 26050), joint: flat(2.75, 26050), deduction: [0, 0], exemption: [2400, 4800] },
  OK: { single: [[2.5, 3750], [3.5, 4900], [4.5, 7200]], joint: [[2.5, 7500], [3.5, 9800], [4.5, 14400]], deduction: [6350, 12700], exemption: [1000, 2000] },
  OR: {
    single: [[4.75, 0], [6.75, 4550], [8.75, 11400], [9.9, 125000]],
    joint: [[4.75, 0], [6.75, 9100], [8.75, 22800], [9.9, 250000]],
    deduction: [2910, 5820],
    exemption: [256, 512],
    exemptionCredit: true,
  },
  PA: { single: flat(3.07), joint: flat(3.07), deduction: [0, 0], exemption: [0, 0] },
  RI: { single: [[3.75, 0], [4.75, 82050], [5.99, 186450]], joint: [[3.75, 0], [4.75, 82050], [5.99, 186450]], deduction: [11200, 22400], exemption: [5250, 10500] },
  SC: { single: [[0, 0], [3, 3640], [6, 18230]], joint: [[0, 0], [3, 3640], [6, 18230]], deduction: [8350, 16700], exemption: [0, 0] },
  UT: { single: flat(4.5), joint: flat(4.5), deduction: [966, 1932], exemption: [0, 0], deductionCredit: true },
  VT: {
    single: [[3.35, 0], [6.6, 49400], [7.6, 119700], [8.75, 249700]],
    joint: [[3.35, 0], [6.6, 82500], [7.6, 199450], [8.75, 304000]],
    deduction: [7650, 15300],
    exemption: [5300, 10600],
  },
  VA: { single: [[2, 0], [3, 3000], [5, 5000], [5.75, 17000]], joint: [[2, 0], [3, 3000], [5, 5000], [5.75, 17000]], deduction: [8750, 17500], exemption: [930, 1860] },
  WV: {
    single: [[2.22, 0], [2.96, 10000], [3.33, 25000], [4.44, 40000], [4.82, 60000]],
    joint: [[2.22, 0], [2.96, 10000], [3.33, 25000], [4.44, 40000], [4.82, 60000]],
    deduction: [0, 0],
    exemption: [2000, 4000],
  },
  WI: {
    single: [[3.5, 0], [4.4, 15110], [5.3, 51950], [7.65, 332720]],
    joint: [[3.5, 0], [4.4, 20150], [5.3, 69260], [7.65, 443630]],
    deduction: [13960, 25840],
    exemption: [700, 1400],
  },
}

/**
 * State figures by tax year; add next year's beside shared/taxes.ts's
 * FEDERAL. A year without its own uses the newest year before it.
 */
export const STATE_TAXES: Record<number, Record<string, StateTax>> = { 2026: STATE_TAX }

/** The year whose state figures `year` uses. */
export function stateTableYear(year: number): number {
  const years = Object.keys(STATE_TAXES).map(Number).sort((a, b) => b - a)
  return years.find(y => y <= year) ?? years.at(-1)!
}

const isJoint = (s: FilingStatus) => s === 'married_joint' || s === 'qualifying_surviving_spouse'

export interface StateEstimate {
  code: string
  income_cents: number
  /** Taken off income: the standard deduction, the exemption, and federal tax where the state allows it. */
  deduction_cents: number
  taxable_cents: number
  /** Taken off the tax: exemptions or deductions the state gives as credits. */
  credit_cents: number
  tax_cents: number
  /** Tax ÷ income, as a fraction. */
  effective: number
  /** The state rate on the next dollar, as a percent. */
  marginal: number
}

/**
 * State income tax on a year's income, or null for a state with no income
 * tax on wages (or no state). `federalTaxCents` is the federal estimate, for
 * a state that lets it be deducted. `year` picks the figures (the newest
 * year's when left out).
 */
export function stateEstimate(code: string | undefined, incomeCents: number, status: FilingStatus, federalTaxCents = 0, year?: number): StateEstimate | null {
  const table = year === undefined ? STATE_TAX : STATE_TAXES[stateTableYear(year)]!
  const t = code ? table[code] : undefined
  if (!t) return null
  const j = isJoint(status) ? 1 : 0
  const income = Math.max(0, Math.round(incomeCents))
  const deduction = (t.deductionCredit ? 0 : t.deduction[j]) * 100
    + (t.exemptionCredit ? 0 : t.exemption[j]) * 100
    + (t.federalDeductible ? Math.max(0, Math.round(federalTaxCents)) : 0)
  const credit = ((t.deductionCredit ? t.deduction[j] : 0) + (t.exemptionCredit ? t.exemption[j] : 0)) * 100
  const taxable = Math.max(0, income - deduction)
  const schedule = j ? t.joint : t.single
  let gross = 0
  let marginal = 0
  schedule.forEach(([rate, from], i) => {
    const start = from * 100
    const end = i + 1 < schedule.length ? schedule[i + 1]![1] * 100 : Infinity
    const taxed = Math.max(0, Math.min(taxable, end) - start)
    gross += taxed * rate / 100
    if (taxable >= start) marginal = rate
  })
  const tax = Math.max(0, Math.round(gross) - credit)
  return {
    code: code!,
    income_cents: income,
    deduction_cents: Math.min(deduction, income),
    taxable_cents: taxable,
    credit_cents: Math.min(credit, Math.round(gross)),
    tax_cents: tax,
    effective: income ? tax / income : 0,
    marginal: taxable > 0 ? marginal : 0,
  }
}
