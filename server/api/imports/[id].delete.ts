import { deleteImport } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/** DELETE /api/imports/:id: undoes an import, removing the transactions it added. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'No such import')
  await attempt(() => deleteImport(s, id), 'No such import')
  setResponseStatus(event, 204)
  return null
})
