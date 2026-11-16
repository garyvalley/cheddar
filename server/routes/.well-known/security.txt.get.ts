/**
 * GET /.well-known/security.txt (RFC 9116): where to report a security
 * problem. Cheddar publishes no email address, so Contact is the contact
 * form, which the RFC allows (a URI). Expires is a year out, worked out on
 * each request, so it never lapses.
 */
export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  expires.setUTCHours(0, 0, 0, 0)
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return [
    `Contact: ${origin}/contact?topic=security`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en',
    'Policy: https://github.com/garyvalley/cheddar/blob/main/SECURITY.md',
    `Canonical: ${origin}/.well-known/security.txt`,
    '',
  ].join('\n')
})
