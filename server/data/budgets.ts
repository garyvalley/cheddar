import { carryFrom, withCarry, type Budget } from '~~/shared/budgets'
import { listCategories } from './categories'
import { householdNames, transactionsBetween } from './transactions'
import { callerId, type Session } from './session'

type BudgetRecord = {
  id: string
  owner: string
  category: string
  amount_cents: number
  rollover?: boolean
  rollover_from?: string
  household?: string
}
const FIELDS = 'id,owner,category,amount_cents,rollover,rollover_from,household'
const toBudget = (r: BudgetRecord, person: string, names?: Map<string, string>): Budget => ({
  category: r.category,
  amount_cents: r.amount_cents,
  rollover: !!r.rollover,
  rollover_from: r.rollover ? (r.rollover_from ?? '') : '',
  ...(r.household ? { shared_with_household: true } : {}),
  ...(r.owner !== person ? { owner_name: names?.get(r.owner) ?? '' } : {}),
})

/**
 * The caller's budgets, one per category: their own, and for a category
 * they have none in, one a household member shares (shared/budgets.ts's
 * `owner_name` says whose). `ownedOnly` leaves the shared ones out, as an
 * export does.
 */
export async function listBudgets(s: Session, ownedOnly = false): Promise<Budget[]> {
  const person = callerId(s)
  const rows = (await s.collection('budgets').getFullList({
    fields: FIELDS,
    sort: 'category,created,id',
    ...(ownedOnly ? { filter: s.filter('owner = {:owner}', { owner: person }) } : {}),
  })) as unknown as BudgetRecord[]
  const mine = new Set(rows.filter(r => r.owner === person).map(r => r.category))
  const seen = new Set<string>()
  const kept = rows.filter((r) => {
    if (r.owner !== person && (mine.has(r.category) || seen.has(r.category))) return false
    seen.add(r.category)
    return true
  })
  const names = kept.some(r => r.owner !== person) ? await householdNames(s) : undefined
  return kept.map(r => toBudget(r, person, names))
}

/** The budget for `category` the caller sees: their own, else one shared with them. */
async function budgetFor(s: Session, category: string): Promise<BudgetRecord | null> {
  const person = callerId(s)
  const rows = (await s.collection('budgets').getFullList({
    fields: FIELDS,
    sort: 'created,id',
    filter: s.filter('category = {:category}', { category }),
  })) as unknown as BudgetRecord[]
  return rows.find(r => r.owner === person) ?? rows[0] ?? null
}

/**
 * Sets the caller's monthly budget for a category, or removes it (null).
 * `rollover` turns carrying on (from `month`, the person's this month) or
 * off; left out, it stays as it was. `share` shares it with the caller's
 * household (`household`, their household's id) or stops sharing it; left
 * out, it stays as it was. A budget a household member shares with the
 * caller takes a new amount only: anything else is its owner's.
 */
export async function setBudget(
  s: Session,
  category: string,
  amount_cents: number | null,
  rollover?: { on: boolean, month: string },
  share?: { on: boolean, household: string },
): Promise<Budget | null> {
  const person = callerId(s)
  const found = await budgetFor(s, category)
  if (found && found.owner !== person) {
    if (amount_cents === null)
      throw createError({ statusCode: 403, statusMessage: 'Only the household member who shared this budget can remove it.' })
    if ((rollover && rollover.on !== !!found.rollover) || share)
      throw createError({ statusCode: 403, statusMessage: 'Only the household member who shared this budget can change more than its amount.' })
    const r = (await s.collection('budgets').update(found.id, { amount_cents }, { fields: FIELDS })) as unknown as BudgetRecord
    return toBudget(r, person, await householdNames(s))
  }
  if (amount_cents === null) {
    if (found) await s.collection('budgets').delete(found.id)
    return null
  }
  const fields: Record<string, unknown> = { amount_cents }
  if (rollover && rollover.on !== !!found?.rollover) {
    fields.rollover = rollover.on
    fields.rollover_from = rollover.on ? rollover.month : ''
  }
  if (share) fields.household = share.on ? share.household : ''
  const r = (found
    ? await s.collection('budgets').update(found.id, fields, { fields: FIELDS })
    : await s.collection('budgets').create({ owner: person, category, ...fields }, { fields: FIELDS })) as unknown as BudgetRecord
  return toBudget(r, person)
}

/**
 * The caller's budgets for `month` (YYYY-MM), each with what carries into
 * it (`carry_cents`, 0 for one that doesn't roll over): from the spending
 * of every month since its rollover began, counted as Spending counts it.
 */
export async function budgetsForMonth(
  s: Session,
  month: string,
): Promise<(Budget & { carry_cents: number })[]> {
  const budgets = await listBudgets(s)
  const first = carryFrom(budgets, month)
  if (!first) return budgets.map(b => ({ ...b, carry_cents: 0 }))
  const [rows, list] = await Promise.all([
    // Up to the end of the month before: no posted date is on or before "YYYY-MM-00".
    transactionsBetween(s, `${first}-01`, `${month}-00`, { counted: true }),
    listCategories(s),
  ])
  return withCarry(budgets, rows, list, month)
}
