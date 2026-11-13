import { createCategory } from '~~/server/data/categories'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/categories { name }: a category of the caller's own. Answers { category }. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const { name } = await readFields<{ name: string }>(event, ['name'])
  const category = await attempt(() => createCategory(s, required(name, 'A name')))
  setResponseStatus(event, 201)
  return { category }
})
