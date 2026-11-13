import { deleteTransaction, getTransaction } from '~~/server/data/transactions'
import { attempt, sessionFor } from '~~/server/data/session'

const GONE = 'That transaction isn\'t there.'

/**
 * DELETE /api/transactions/:id: removes one added by hand. One from a bank
 * would come back with the next sync, and one from a statement goes with
 * undoing its import; either can be left out instead.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), GONE)
  const current = await attempt(() => getTransaction(s, id), GONE)
  if (current.source !== 'manual') {
    throw createError({ statusCode: 400, statusMessage: current.source === 'sync'
      ? 'It comes from your bank and would come back. Leave it out instead.'
      : 'It came from a statement: undo that import on Accounts, or leave this one out.' })
  }
  await attempt(() => deleteTransaction(s, id), GONE)
  setResponseStatus(event, 204)
  return null
})
