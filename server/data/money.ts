import { createHash } from 'node:crypto'
import type { RecordModel } from 'pocketbase'
import type { Account, Import, NewAccount, Transaction } from '~~/shared/accounts'
import { summarize, type Category, type SpendingSummary } from '~~/shared/categories'
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
 * Adds a statement's rows to an account, skipping each one it already has,
 * and records the import. All or nothing: if any write fails, the import is
 * deleted, which takes whatever it had added with it.
 */
export async function importRows(s: Session, account: string, file: { filename: string, format: StatementFormat, rows: StatementRow[] }) {
  const owner = callerId(s)
  const ids = externalIds(file.rows)
  const range = dateRange(file.rows)
  const have = new Set<string>()
  if (range) {
    const existing = await s.collection('transactions').getFullList({
      fields: 'external_id',
      filter: s.filter('account = {:account} && posted >= {:first} && posted <= {:last}', { account, ...range }),
    })
    for (const r of existing) have.add(r.external_id)
  }
  const fresh: { row: StatementRow, id: string }[] = []
  file.rows.forEach((row, i) => {
    const id = ids[i]!
    if (have.has(id)) return
    have.add(id) // an OFX file that repeats an id
    fresh.push({ row, id })
  })

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
