import type { H3Event } from 'h3'

/**
 * Only the named fields of a JSON body, so nothing a client adds reaches the
 * store. The values themselves are the caller's to check.
 */
export async function readFields<T>(event: H3Event, keys: readonly (keyof T & string)[]): Promise<Partial<T>> {
  const body = await readBody<Record<string, unknown> | null>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'A JSON object is required' })
  }
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in body) out[key] = body[key]
  }
  return out as Partial<T>
}

/** A required string field, or a 400 saying it is missing. */
export function required(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError({ statusCode: 400, statusMessage: `${what} is required` })
  }
  return value
}
