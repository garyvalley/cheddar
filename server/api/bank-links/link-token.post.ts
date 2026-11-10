import { linkToken } from '~~/server/data/bank-links'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/bank-links/link-token { link? }: a token to open Plaid Link with; with a link's id, to sign in to that bank again. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const { link } = await readFields<{ link: string }>(event, ['link'])
  return attempt(() => linkToken(s, typeof link === 'string' && link ? link : undefined), 'That link isn\'t there.')
})
