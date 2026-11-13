import { createHash } from 'node:crypto'
import type { RecordModel } from 'pocketbase'
import type { Account, Import, NewAccount, Transaction } from '~~/shared/accounts'
import { localToday, summarize, type Category, type SpendingSummary } from '~~/shared/categories'
import { GROWTH_PERIODS, growth, growthStart, isInvestment, lastMonths, monthly, netWorth, netWorthChange, type BalancePoint, type Overview } from '~~/shared/overview'
import { PACE_MONTHS, debts, invested, savings, type Projections } from '~~/shared/projections'
import { taxYear, type TaxYear } from '~~/shared/taxes'
import { LOOKBACK_YEARS, recurring, type Charge, type RecurringSummary } from '~~/shared/recurring'
import { alreadySynced, around, type Dated } from '~~/shared/overlap'
import { dateRange, type StatementFormat, type StatementRow } from '~~/shared/statements'
import { callerId, type Session } from './session'

/**
 * Accounts, their transactions and the statement files imported into them,
 * always as the signed-in person: PocketBase's rules
 * (migrations/0003_accounts_and_transactions.mjs) keep each person's to them.
 */

const toAccount = (r: RecordModel): Account => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  institution: r.institution ?? '',
  last4: r.last4 ?? '',
  currency: r.currency || 'USD',
  source: r.source ?? '',
  balance_cents: r.balance_date ? (r.balance_cents ?? 0) : null,
  balance_date: r.balance_date ?? '',
  linked: !!r.link,
})

const toTransaction = (r: RecordModel): Transaction => ({
  id: r.id,
  account: r.account,
  posted: r.posted,
  amount_cents: r.amount_cents ?? 0,
  description: r.description ?? '',
  payee: r.payee ?? '',
  category: r.category ?? '',
  category_by: r.category_by ?? '',
  pending: !!r.pending,
  source: r.source,
})

const toImport = (r: RecordModel): Import => ({
  id: r.id,
  account: r.account,
  filename: r.filename ?? '',
  format: r.format,
  added: r.added ?? 0,
  skipped: r.skipped ?? 0,
  first_date: r.first_date ?? '',
  last_date: r.last_date ?? '',
  created: r.created,
})

export async function listAccounts(s: Session): Promise<Account[]> {
  return (await s.collection('accounts').getFullList({ sort: 'name,created' })).map(toAccount)
}

/** One of the caller's accounts; a 404 from the store for anyone else's. */
export async function getAccount(s: Session, id: string): Promise<Account> {
  return toAccount(await s.collection('accounts').getOne(id))
}

export async function createAccount(s: Session, a: NewAccount): Promise<Account> {
  return toAccount(await s.collection('accounts').create({ ...a, owner: callerId(s), currency: 'USD', source: 'manual' }))
}

/**
 * Sets the balance of an account no bank link keeps up to date, as of `date`
 * (today for one entered by hand, a statement's closing day for one read from
 * it); pb_hooks/balances.pb.js adds it to the account's history.
 */
export async function setBalance(s: Session, id: string, cents: number, date: string): Promise<Account> {
  return toAccount(await s.collection('accounts').update(id, { balance_cents: cents, balance_date: date }))
}

/** Deletes the account with every transaction and import in it. */
export async function deleteAccount(s: Session, id: string): Promise<void> {
  await s.collection('accounts').delete(id)
}

export const PAGE_SIZE = 50

export interface TransactionQuery {
  account?: string
  /** A category id; "other" also finds what isn't sorted yet. */
  category?: string
  /** YYYY-MM-DD, both ends included. */
  from?: string
  to?: string
}

function transactionFilter(s: Session, q: TransactionQuery): string {
  const parts: string[] = []
  const params: Record<string, string> = {}
  if (q.account) { parts.push('account = {:account}'); params.account = q.account }
  if (q.category === 'other') parts.push('(category = \'other\' || category = \'\')')
  else if (q.category) { parts.push('category = {:category}'); params.category = q.category }
  if (q.from) { parts.push('posted >= {:from}'); params.from = q.from }
  if (q.to) { parts.push('posted <= {:to}'); params.to = q.to }
  return s.filter(parts.join(' && '), params)
}

export async function listTransactions(s: Session, q: TransactionQuery & { page: number }) {
  const filter = transactionFilter(s, q)
  const list = await s.collection('transactions').getList(q.page, PAGE_SIZE, {
    sort: '-posted,-created',
    ...(filter ? { filter } : {}),
  })
  return { items: list.items.map(toTransaction), page: list.page, pages: list.totalPages, total: list.totalItems }
}

/** Every transaction a query finds, oldest first, as a download lists them. */
export async function allTransactions(s: Session, q: TransactionQuery): Promise<(Transaction & { import: string })[]> {
  const filter = transactionFilter(s, q)
  const rows = await s.collection('transactions').getFullList({
    sort: 'posted,created',
    fields: 'id,account,import,posted,amount_cents,description,payee,category,category_by,pending,source',
    ...(filter ? { filter } : {}),
  })
  return rows.map(r => ({ ...toTransaction(r), import: r.import ?? '' }))
}

/** What each category came to between two dates, and the spending of the same span before. */
export async function spendingSummary(s: Session, q: { account?: string, from: string, to: string, previous: { from: string, to: string } }): Promise<SpendingSummary> {
  const rows = (range: { from: string, to: string }) => s.collection('transactions').getFullList({
    fields: 'amount_cents,category',
    filter: transactionFilter(s, { account: q.account, ...range }),
  }) as Promise<unknown> as Promise<{ amount_cents: number, category: string }[]>
  const [now, before, list] = await Promise.all([rows(q), rows(q.previous), listCategories(s)])
  return { from: q.from, to: q.to, ...summarize(now, list), previous_spent_cents: summarize(before, list).spent_cents }
}

/**
 * Moves a transaction to another category (pb_hooks/categories.pb.js): the
 * merchant's other transactions, and its next ones, follow. Answers how many
 * others moved.
 */
export function recategorize(s: Session, id: string, category: string): Promise<{ transaction: { id: string, category: string }, moved: number }> {
  return s.send(`/api/transactions/${encodeURIComponent(id)}/category`, { method: 'POST', body: { category } })
}

export async function listImports(s: Session, account?: string): Promise<Import[]> {
  return (await s.collection('imports').getFullList({
    sort: '-created',
    ...(account ? { filter: s.filter('account = {:account}', { account }) } : {}),
  })).map(toImport)
}

/** Undoes an import: its transactions go with it. */
export async function deleteImport(s: Session, id: string): Promise<void> {
  await s.collection('imports').delete(id)
}

/**
 * What identifies a file's row next time: the bank's own id when the file
 * has one, else a hash of what the row says. Two rows that say the same
 * thing on the same day (two coffees) are told apart by their order in the
 * file, so importing the same file, or one whose dates overlap it, adds
 * each of them once.
 */
export function externalIds(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    if (r.fitid) return `fitid:${r.fitid}`
    const key = `${r.posted}|${r.amount_cents}|${r.description.toLowerCase().replace(/\s+/g, ' ').trim()}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return `csv:${createHash('sha256').update(`${key}|${n}`).digest('hex').slice(0, 40)}`
  })
}

const BATCH = 200 // migrations/0003: the batch API's maxRequests

/**
 * Adds a statement's rows to an account, skipping each one it already has:
 * the same file row from an earlier import, or the same transaction from the
 * account's bank link (shared/overlap.ts). Records the import. All or
 * nothing: if any write fails, the import is deleted, which takes whatever it
 * had added with it.
 */
export async function importRows(s: Session, account: string, file: { filename: string, format: StatementFormat, rows: StatementRow[] }) {
  const owner = callerId(s)
  const ids = externalIds(file.rows)
  const range = dateRange(file.rows)
  const have = new Set<string>()
  let synced: Dated[] = []
  if (range) {
    const span = around(range.first, range.last)
    const existing = await s.collection('transactions').getFullList({
      fields: 'external_id,source,posted,amount_cents',
      filter: s.filter('account = {:account} && posted >= {:from} && posted <= {:to}', { account, ...span }),
    })
    for (const r of existing) have.add(r.external_id)
    synced = existing.filter(r => r.source === 'sync').map(r => ({ posted: r.posted, amount_cents: r.amount_cents }))
  }
  const candidates: { row: StatementRow, id: string }[] = []
  file.rows.forEach((row, i) => {
    const id = ids[i]!
    if (have.has(id)) return
    have.add(id) // an OFX file that repeats an id
    candidates.push({ row, id })
  })
  const fromLink = alreadySynced(candidates.map(c => c.row), synced)
  const fresh = candidates.filter((_, i) => !fromLink[i])

  const record = await s.collection('imports').create({
    owner, account, filename: file.filename.slice(0, 200), format: file.format,
    added: fresh.length, skipped: file.rows.length - fresh.length,
    first_date: range?.first ?? '', last_date: range?.last ?? '',
  })
  try {
    for (let i = 0; i < fresh.length; i += BATCH) {
      const batch = s.createBatch()
      for (const { row, id } of fresh.slice(i, i + BATCH)) {
        batch.collection('transactions').create({
          owner, account, import: record.id, source: 'import', external_id: id,
          posted: row.posted, amount_cents: row.amount_cents, description: row.description,
        })
      }
      await batch.send()
    }
  }
  catch (error) {
    await s.collection('imports').delete(record.id).catch(() => {})
    throw error
  }
  return toImport(record)
}

/**
 * The person's categories, built in and their own: the routes in
 * pb_hooks/categories.pb.js, which alone read and write their own ones.
 */
export async function listCategories(s: Session): Promise<Category[]> {
  return (await s.send('/api/categories', { method: 'GET' })).categories
}

export async function createCategory(s: Session, name: string): Promise<Category> {
  return (await s.send('/api/categories', { method: 'POST', body: { name } })).category
}

export async function renameCategory(s: Session, id: string, name: string): Promise<Category> {
  return (await s.send(`/api/categories/${encodeURIComponent(id)}/rename`, { method: 'POST', body: { name } })).category
}

/** Deletes one of the person's own categories; its transactions are sorted again on their own. */
export async function removeCategory(s: Session, id: string): Promise<{ resorted: number }> {
  return await s.send(`/api/categories/${encodeURIComponent(id)}/remove`, { method: 'POST' })
}

/**
 * Overview's numbers (shared/overview.ts): net worth and its change since a
 * month ago, the last 12 months' income and spending, and the investment
 * accounts' growth over each period.
 */
export async function overview(s: Session, today = localToday()): Promise<Overview> {
  const months = lastMonths(today, 12)
  const [accounts, rows, history, list] = await Promise.all([
    listAccounts(s),
    s.collection('transactions').getFullList({
      fields: 'account,posted,amount_cents,category',
      filter: s.filter('posted >= {:from} && posted <= {:to}', { from: `${months[0]}-01`, to: `${months.at(-1)}-31` }),
    }) as Promise<unknown> as Promise<{ account: string, posted: string, amount_cents: number, category: string }[]>,
    s.collection('balance_history').getFullList({ fields: 'account,date,balance_cents', sort: 'date' }) as Promise<unknown> as Promise<BalancePoint[]>,
    listCategories(s),
  ])
  const invested = accounts.filter(a => isInvestment(a.kind) && a.balance_cents !== null)
  const ids = new Set(invested.map(a => a.id))
  // Transfers into the investment accounts aren't growth. Older ones than the
  // year above only matter to "All", so they're read only when there's history that old.
  const oldest = history.reduce((d, p) => (ids.has(p.account) && p.date < d ? p.date : d), `${months[0]}-01`)
  const older = oldest < `${months[0]}-01` && ids.size
    ? await s.collection('transactions').getFullList({
      fields: 'account,posted,amount_cents,category',
      filter: s.filter('posted >= {:from} && posted < {:to} && category = \'transfer\'', { from: oldest, to: `${months[0]}-01` }),
    }) as unknown as typeof rows
    : []
  const transfers = [...older, ...rows].filter(r => ids.has(r.account) && r.category === 'transfer')
  return {
    net_worth: netWorth(accounts),
    change: netWorthChange(accounts, history, growthStart('1m', today)),
    months: monthly(rows, months, list),
    has_investments: invested.length > 0,
    growth: GROWTH_PERIODS.map(p => growth(accounts, history, transfers, p.id, today)),
  }
}

/**
 * The subscriptions and bills in the last few years' spending
 * (shared/recurring.ts), in one account or all of them.
 */
export async function recurringCharges(s: Session, account?: string, today = localToday()): Promise<RecurringSummary> {
  const from = `${Number(today.slice(0, 4)) - LOOKBACK_YEARS}${today.slice(4)}`
  const [rows, list] = await Promise.all([
    s.collection('transactions').getFullList({
      fields: 'account,posted,amount_cents,merchant_key,payee,description,category,pending',
      filter: s.filter(`posted >= {:from} && amount_cents < 0 && pending = false${account ? ' && account = {:account}' : ''}`, { from, account: account ?? '' }),
    }) as Promise<unknown> as Promise<Charge[]>,
    listCategories(s),
  ])
  return recurring(rows, list, today)
}

/**
 * Projections' numbers (shared/projections.ts): the last whole months'
 * income and spending for the savings rate, what's invested now, and each
 * debt with the pace it's being paid down. The page projects from them on
 * the assumptions the person picks.
 */
export async function projections(s: Session, today = localToday()): Promise<Projections> {
  const months = lastMonths(today, PACE_MONTHS + 1).slice(0, PACE_MONTHS)
  const [accounts, rows, history, list] = await Promise.all([
    listAccounts(s),
    s.collection('transactions').getFullList({
      fields: 'account,posted,amount_cents,category',
      filter: s.filter('posted >= {:from} && posted <= {:to}', { from: `${months[0]}-01`, to: `${months.at(-1)}-31` }),
    }) as Promise<unknown> as Promise<{ account: string, posted: string, amount_cents: number, category: string }[]>,
    s.collection('balance_history').getFullList({ fields: 'account,date,balance_cents', sort: 'date' }) as Promise<unknown> as Promise<BalancePoint[]>,
    listCategories(s),
  ])
  const monthsIn = monthly(rows, months, list)
  return {
    months: monthsIn,
    savings: savings(monthsIn),
    invested_cents: invested(accounts),
    has_investments: accounts.some(a => isInvestment(a.kind) && a.balance_cents !== null),
    debts: debts(accounts, rows, history, months),
  }
}

/**
 * The tax year so far, from this year's transactions (shared/taxes.ts): the
 * earliest transaction the person has at all says where their data starts.
 */
export async function taxes(s: Session, today = localToday()): Promise<TaxYear> {
  const jan1 = `${today.slice(0, 4)}-01-01`
  const [accounts, rows, first] = await Promise.all([
    listAccounts(s),
    s.collection('transactions').getFullList({
      fields: 'account,posted,amount_cents,category',
      filter: s.filter('posted >= {:from} && posted <= {:to}', { from: jan1, to: today }),
    }) as Promise<unknown> as Promise<{ account: string, posted: string, amount_cents: number, category: string }[]>,
    s.collection('transactions').getList(1, 1, { fields: 'posted', sort: 'posted', skipTotal: true }),
  ])
  return taxYear(rows, accounts, today, (first.items[0]?.posted as string | undefined) ?? '')
}
