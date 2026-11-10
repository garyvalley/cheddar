import { listLinks } from '~~/server/data/bank-links'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/bank-links: whether linking is on, and the caller's links with their accounts. */
export default defineEventHandler((event) => {
  // Outside attempt(): its 401 is h3's own error, which storeError() would read as an outage.
  const s = sessionFor(event)
  return attempt(() => listLinks(s))
})
