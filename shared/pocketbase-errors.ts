/**
 * Whether a PocketBase call failed because PocketBase couldn't answer --
 * unreachable, or restarting during a deploy -- rather than because it
 * refused (#135). Only a refusal (401, 403) means a session has ended; a
 * restart must never sign anyone out.
 */
export function pocketBaseUnavailable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status ?? 0
  const aborted = (error as { isAbort?: boolean } | null)?.isAbort === true
  return !aborted && (status === 0 || status >= 500)
}

/** What a request gets while PocketBase is restarting; nginx shows its holding page for a 503. */
export const UNAVAILABLE = { statusCode: 503, statusMessage: 'Cheddar is updating. Try again in a few seconds.' } as const
