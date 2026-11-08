/** Federal filing statuses, as users.filing_status stores them (migrations/0001_accounts.mjs). */
export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married filing jointly' },
  { value: 'married_separate', label: 'Married filing separately' },
  { value: 'head_of_household', label: 'Head of household' },
  { value: 'qualifying_surviving_spouse', label: 'Qualifying surviving spouse' },
] as const

export type FilingStatus = typeof FILING_STATUSES[number]['value']

export function isFilingStatus(value: unknown): value is FilingStatus {
  return FILING_STATUSES.some(s => s.value === value)
}
