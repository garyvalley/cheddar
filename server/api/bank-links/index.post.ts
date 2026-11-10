import { addLink } from '~~/server/data/bank-links'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/bank-links { public_token, institution? }: keeps the bank Plaid Link just signed in to, and syncs it. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const { public_token, institution } = await readFields<{ public_token: string, institution: string }>(event, ['public_token', 'institution'])
  const token = required(public_token, 'Plaid\'s answer')
  return attempt(() => addLink(s, token, typeof institution === 'string' ? institution.slice(0, 100) : ''))
})
