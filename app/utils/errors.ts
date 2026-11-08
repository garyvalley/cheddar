/** The message a failed $fetch carries from the server, or a generic one. */
export function errorMessage(e: unknown): string {
  const data = (e as { data?: { message?: string, statusMessage?: string } }).data
  return data?.message || data?.statusMessage || 'Something went wrong. Check your connection and try again.'
}

/** A same-site path to go to after signing in, or '/'. Refuses `//host` and absolute URLs. */
export function safeNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/'
}
