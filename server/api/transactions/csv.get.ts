import { csvName, transactionsCsv } from '~~/shared/export'
import { allTransactions } from '~~/server/data/transactions'
import { listAccounts } from '~~/server/data/accounts'
import { listCategories } from '~~/server/data/categories'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/transactions/csv?account=&category=&from=&to=: the transactions
 * Spending is showing, as a spreadsheet, oldest first. It's what the page
 * already lists, a page at a time, so it asks for no password.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const query = readTransactionQuery(event)
  const [rows, accounts, categories] = await attempt(() => Promise.all([allTransactions(s, query), listAccounts(s), listCategories(s)]))
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${csvName(query.from, query.to)}"`)
  return transactionsCsv(rows, accounts, categories)
})
