/**
 * The places a person can file state income tax in: the 50 states and DC,
 * by USPS code. A person's choice is stored as the code
 * (users.state, migrations/0001_accounts.mjs).
 *
 * `incomeTax` is whether the state taxes wages at all, so the app never
 * suggests state-tax ideas where there is no state tax. New Hampshire and
 * Washington are false: NH's interest-and-dividends tax ended in 2025, and
 * Washington taxes only some capital gains, which the tax rules will handle
 * on their own.
 */
export interface UsState {
  code: string
  name: string
  incomeTax: boolean
}

export const STATES: readonly UsState[] = [
  { code: 'AL', name: 'Alabama', incomeTax: true },
  { code: 'AK', name: 'Alaska', incomeTax: false },
  { code: 'AZ', name: 'Arizona', incomeTax: true },
  { code: 'AR', name: 'Arkansas', incomeTax: true },
  { code: 'CA', name: 'California', incomeTax: true },
  { code: 'CO', name: 'Colorado', incomeTax: true },
  { code: 'CT', name: 'Connecticut', incomeTax: true },
  { code: 'DE', name: 'Delaware', incomeTax: true },
  { code: 'DC', name: 'District of Columbia', incomeTax: true },
  { code: 'FL', name: 'Florida', incomeTax: false },
  { code: 'GA', name: 'Georgia', incomeTax: true },
  { code: 'HI', name: 'Hawaii', incomeTax: true },
  { code: 'ID', name: 'Idaho', incomeTax: true },
  { code: 'IL', name: 'Illinois', incomeTax: true },
  { code: 'IN', name: 'Indiana', incomeTax: true },
  { code: 'IA', name: 'Iowa', incomeTax: true },
  { code: 'KS', name: 'Kansas', incomeTax: true },
  { code: 'KY', name: 'Kentucky', incomeTax: true },
  { code: 'LA', name: 'Louisiana', incomeTax: true },
  { code: 'ME', name: 'Maine', incomeTax: true },
  { code: 'MD', name: 'Maryland', incomeTax: true },
  { code: 'MA', name: 'Massachusetts', incomeTax: true },
  { code: 'MI', name: 'Michigan', incomeTax: true },
  { code: 'MN', name: 'Minnesota', incomeTax: true },
  { code: 'MS', name: 'Mississippi', incomeTax: true },
  { code: 'MO', name: 'Missouri', incomeTax: true },
  { code: 'MT', name: 'Montana', incomeTax: true },
  { code: 'NE', name: 'Nebraska', incomeTax: true },
  { code: 'NV', name: 'Nevada', incomeTax: false },
  { code: 'NH', name: 'New Hampshire', incomeTax: false },
  { code: 'NJ', name: 'New Jersey', incomeTax: true },
  { code: 'NM', name: 'New Mexico', incomeTax: true },
  { code: 'NY', name: 'New York', incomeTax: true },
  { code: 'NC', name: 'North Carolina', incomeTax: true },
  { code: 'ND', name: 'North Dakota', incomeTax: true },
  { code: 'OH', name: 'Ohio', incomeTax: true },
  { code: 'OK', name: 'Oklahoma', incomeTax: true },
  { code: 'OR', name: 'Oregon', incomeTax: true },
  { code: 'PA', name: 'Pennsylvania', incomeTax: true },
  { code: 'RI', name: 'Rhode Island', incomeTax: true },
  { code: 'SC', name: 'South Carolina', incomeTax: true },
  { code: 'SD', name: 'South Dakota', incomeTax: false },
  { code: 'TN', name: 'Tennessee', incomeTax: false },
  { code: 'TX', name: 'Texas', incomeTax: false },
  { code: 'UT', name: 'Utah', incomeTax: true },
  { code: 'VT', name: 'Vermont', incomeTax: true },
  { code: 'VA', name: 'Virginia', incomeTax: true },
  { code: 'WA', name: 'Washington', incomeTax: false },
  { code: 'WV', name: 'West Virginia', incomeTax: true },
  { code: 'WI', name: 'Wisconsin', incomeTax: true },
  { code: 'WY', name: 'Wyoming', incomeTax: false },
]

const BY_CODE = new Map(STATES.map(s => [s.code, s]))

/** The state for a code, or undefined for anything else (including ''). */
export function stateByCode(code: unknown): UsState | undefined {
  return typeof code === 'string' ? BY_CODE.get(code) : undefined
}
