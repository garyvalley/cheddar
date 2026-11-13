import { listImports } from '~~/server/data/imports'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/imports?account=: the statement files imported, newest first. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  const account = q.account ? recordId(q.account, 'No such account') : undefined
  return { imports: await attempt(() => listImports(s, account)) }
})
