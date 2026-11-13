import type { H3Event } from 'h3'

/**
 * Name of the httpOnly cookie holding the PocketBase auth token.
 *
 * The browser can never read this value: the server reads it and calls
 * PocketBase with it (server/data/session.ts). Script on the page, even
 * injected script, cannot take the token away.
 */
export const AUTH_COOKIE = 'pb_token'

/**
 * The id of this device's session (pb_hooks/sessions.pb.js): PocketBase
 * honours the token only beside it, so signing out ends the device for real.
 * httpOnly like the token.
 */
export const SESSION_COOKIE = 'cheddar_sid'

const COOKIE = {
  httpOnly: true,
  secure: !import.meta.dev,
  // Lax keeps a link from an email opening signed in, while still
  // refusing cross-site POSTs.
  sameSite: 'lax',
  path: '/',
  // As long as PocketBase's token lasts (migrations/0001_accounts.mjs);
  // every page load renews both.
  maxAge: 60 * 60 * 24 * 3,
} as const

/** The token, and with a new sign-in its session id; without one, the session cookie is renewed as it is. */
export function setAuthCookie(event: H3Event, token: string, session?: string) {
  setCookie(event, AUTH_COOKIE, token, COOKIE)
  const sid = session || getSessionId(event)
  if (sid) setCookie(event, SESSION_COOKIE, sid, COOKIE)
}

export function clearAuthCookie(event: H3Event) {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export function getAuthToken(event: H3Event): string | undefined {
  return getCookie(event, AUTH_COOKIE)
}

export function getSessionId(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE)
}

/** What PocketBase notes about a new sign-in's device: its browser and country, for Settings' devices list. */
export function deviceHeaders(event: H3Event): Record<string, string> {
  return {
    'X-Cheddar-Device': (getRequestHeader(event, 'user-agent') || '').slice(0, 400),
    'X-Cheddar-Place': getRequestHeader(event, 'cf-ipcountry') || '',
  }
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
