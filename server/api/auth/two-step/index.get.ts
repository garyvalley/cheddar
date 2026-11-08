import { twoStepStatus } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/auth/two-step: whether two-step sign-in is on, and how many recovery codes are left. */
export default defineEventHandler(event => attempt(() => twoStepStatus(sessionFor(event))))
