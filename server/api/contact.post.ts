import { anonymous, attempt, pocketBaseFor } from '~~/server/data/session'
import { checkContact } from '~~/shared/contact'

/**
 * POST /api/contact { name, email, topic, message }: a message to whoever
 * runs Cheddar (pb_hooks/contact.pb.js keeps and forwards it). Signed in or
 * not; when signed in, it goes as that person, so the message says which
 * account sent it. `website` is a field people never see: a form that fills
 * it is a bot, told it worked and dropped.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const body = await readFields<Record<string, unknown>>(event, ['name', 'email', 'topic', 'message', 'website'])
  if (typeof body.website === 'string' && body.website.trim()) {
    setResponseStatus(event, 204)
    return null
  }
  const checked = checkContact(body)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  const send = (pb: ReturnType<typeof anonymous>) => pb.send('/api/contact', { method: 'POST', body: checked.ok })
  const token = getAuthToken(event)
  await attempt(async () => {
    if (!token) return send(anonymous())
    // A session that has run out still gets its message through, unattributed.
    try { return await send(pocketBaseFor(token, getSessionId(event))) }
    catch (error) {
      if ((error as { status?: number }).status !== 401) throw error
      return send(anonymous())
    }
  })
  setResponseStatus(event, 204)
  return null
})
