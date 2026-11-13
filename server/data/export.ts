import { EXPORT_VERSION, exportFiles, type BalancePoint, type CategoryRule, type ExportData } from '~~/shared/export'
import { listLinks } from './bank-links'
import { allTransactions, listAccounts, listCategories, listImports } from './money'
import { toMe } from './profile'
import { todayIn } from '~~/shared/time-zone'
import { zip } from './zip'
import { callerId, type Session } from './session'

/**
 * Everything the person has, read as them: PocketBase's rules let each read
 * only their own. The password goes first, to pb_hooks/export.pb.js, which
 * answers with the merchant rules only the hooks can read; nothing else is
 * read until it has said yes.
 */
export async function exportData(s: Session, password: string, now = new Date()): Promise<ExportData> {
  const { category_rules } = await s.send<{ category_rules: CategoryRule[] }>('/api/export', { method: 'POST', body: { password } })
  const [user, accounts, transactions, imports, history, categories, links] = await Promise.all([
    s.collection('users').getOne(callerId(s)),
    listAccounts(s),
    allTransactions(s, { uncounted: true }),
    listImports(s),
    s.collection('balance_history').getFullList({ fields: 'account,date,balance_cents', sort: 'date' }) as Promise<unknown> as Promise<BalancePoint[]>,
    listCategories(s),
    listLinks(s),
  ])
  const me = toMe(user)
  return {
    cheddar_export: EXPORT_VERSION,
    exported: now.toISOString(),
    profile: { name: me.name, email: me.email, state: me.state, filing_status: me.filing_status, theme: me.theme, appearance: me.appearance, time_zone: me.time_zone },
    accounts,
    transactions,
    imports,
    balance_history: history.map(p => ({ account: p.account, date: p.date, balance_cents: p.balance_cents })),
    categories,
    category_rules,
    bank_links: links.links.map(l => ({ institutions: l.institutions, status: l.status, last_synced: l.last_synced, accounts: l.accounts.map(a => a.id) })),
  }
}

/**
 * The export as a zip (accounts.csv, transactions.csv, balance_history.csv
 * and cheddar.json), and the person's own today, to name it by.
 */
export async function exportZip(s: Session, password: string, now = new Date()): Promise<{ file: Buffer, day: string }> {
  const data = await exportData(s, password, now)
  return { file: zip(exportFiles(data), now), day: todayIn(data.profile.time_zone, now) }
}
