/** POST /api/auth/logout: forgets this browser's session. */
export default defineEventHandler((event) => {
  assertSameOrigin(event)
  clearAuthCookie(event)
  setResponseStatus(event, 204)
  return null
})
