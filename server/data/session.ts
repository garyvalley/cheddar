import type { H3Event } from 'h3'
import PocketBase, { getTokenPayload } from 'pocketbase'
import { pocketBaseUnavailable, UNAVAILABLE } from '~~/shared/pocketbase-errors'

/**
 * Who a data-layer call acts as: a PocketBase client holding the caller's
 * own token, so every read and write goes through PocketBase's collection
 * rules. Nothing on the web path uses a superuser.
 */
export type Session = PocketBase

/** A client with no one signed in, for sign-up, sign-in and reset links. */
export function anonymous(): PocketBase {
  const pb = new PocketBase(useRuntimeConfig().pocketbaseUrl)
  // Each request has its own client; cancelling a "duplicate" would only
  // ever cancel a real request.
  pb.autoCancellation(false)
  return pb
}

/** A client acting as the holder of `token`. */
export function pocketBaseFor(token: string): Session {
  const pb = anonymous()
  pb.authStore.save(token, null)
  return pb
}

/**
 * The caller's session, from the httpOnly cookie; 401 without one. What it
 * reads is that person's alone, so the response is never cached.
 */
export function sessionFor(event: H3Event): Session {
  const token = getAuthToken(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue' })
  setResponseHeader(event, 'cache-control', 'no-store, private')
  return pocketBaseFor(token)
}

/** The id of the person a session acts as. */
export function callerId(s: Session): string {
  return getTokenPayload(s.authStore.token).id as string
}

/**
 * A failed store call as the error the endpoint answers with. A record the
 * caller may not see is a 404, so an endpoint never confirms that someone
 * else's record exists. A refused write keeps its status and the store's own
 * message. A store that can't answer is a 503, so a deploy never looks like
 * a lost session.
 */
export function storeError(error: unknown, notFound = 'Not found'): Error {
  if (pocketBaseUnavailable(error)) return createError(UNAVAILABLE)
  const { status, response } = error as { status?: number, response?: { message?: string } }
  if (status === 401) return createError({ statusCode: 401, statusMessage: 'Sign in to continue' })
  if (status === 404) return createError({ statusCode: 404, statusMessage: notFound })
  if (status === 400 || status === 403 || status === 429) {
    return createError({ statusCode: status, message: response?.message || 'The change was refused' })
  }
  return createError({ statusCode: 502, statusMessage: 'Could not reach the data store' })
}

/** Run a store call, answering with `storeError()` when it fails. */
export async function attempt<T>(run: () => Promise<T>, notFound?: string): Promise<T> {
  try {
    return await run()
  }
  catch (error) {
    throw storeError(error, notFound)
  }
}
