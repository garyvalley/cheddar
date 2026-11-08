import { addLink } from '~~/server/data/bank-links'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/bank-links { setup_token }: links the accounts behind a SimpleFIN setup token and syncs them. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const { setup_token } = await readFields<{ setup_token: string }>(event, ['setup_token'])
  return attempt(() => addLink(s, required(setup_token, 'A setup token')))
})
