import { isCustomId } from '~~/shared/categories'
import { renameCategory } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/categories/:id/rename { name }: renames one of the caller's own categories. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = getRouterParam(event, 'id')
  if (!isCustomId(id)) throw createError({ statusCode: 404, statusMessage: 'That category isn\'t there.' })
  const { name } = await readFields<{ name: string }>(event, ['name'])
  return { category: await attempt(() => renameCategory(s, id, required(name, 'A name')), 'That category isn\'t there.') }
})
