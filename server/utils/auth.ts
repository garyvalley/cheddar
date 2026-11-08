import type { H3Event } from 'h3'

/**
 * Name of the httpOnly cookie holding the PocketBase auth token.
 *
 * The browser can never read this value: the server reads it and calls
 * PocketBase with it (server/data/session.ts). Script on the page, even
 * injected script, cannot take the token away.
 */
export const AUTH_COOKIE = 'pb_token'

export function setAuthCookie(event: H3Event, token: string) {
  setCookie(event, AUTH_COOKIE, token, {
    httpOnly: true,
    secure: !import.meta.dev,
    // Lax keeps a link from an email opening signed in, while still
    // refusing cross-site POSTs.
    sameSite: 'lax',
    path: '/',
    // As long as PocketBase's token lasts (migrations/0001_accounts.mjs);
    // every page load renews both.
    maxAge: 60 * 60 * 24 * 3,
  })
}

export function clearAuthCookie(event: H3Event) {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
}

export function getAuthToken(event: H3Event): string | undefined {
  return getCookie(event, AUTH_COOKIE)
}

/**
 * Reject state-changing requests that did not originate from this site.
 *
 * Cookie auth is ambient — the browser attaches it to any request, including
 * ones triggered by another site. SameSite=Lax already blocks cross-site form
 * POSTs; this is the belt-and-braces check for anything Lax lets through.
 */
export function assertSameOrigin(event: H3Event) {
  const method = event.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const expected = getRequestURL(event).origin
  const origin = getRequestHeader(event, 'origin')

  if (origin) {
    if (origin !== expected) {
      throw createError({ statusCode: 403, statusMessage: 'Cross-origin request refused' })
    }
    return
  }

  // No Origin header: fall back to Referer, and refuse if neither is present
  // on a mutating request.
  const referer = getRequestHeader(event, 'referer')
  if (!referer || !referer.startsWith(expected + '/')) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin request refused' })
  }
}
