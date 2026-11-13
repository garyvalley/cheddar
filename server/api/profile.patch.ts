import { updateProfile } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkProfile, type Profile } from '~~/shared/profile'

/** PATCH /api/profile { name?, state?, filing_status?, theme?, appearance?, time_zone? }: the caller's own profile. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<Profile>(event, ['name', 'state', 'filing_status', 'theme', 'appearance', 'time_zone'])
  const checked = checkProfile(body)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  return { me: await attempt(() => updateProfile(s, checked.ok)) }
})
