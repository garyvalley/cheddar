/**
 * Which Terms of Use and Privacy Notice are in force. A version is the date
 * it took effect. Everyone agrees to TERMS_VERSION when they sign up
 * (POST /api/auth/register), and anyone who agreed to an older one is asked
 * again at their next visit (app/middleware/auth.global.ts, /agree). Built
 * for the hooks (pb_hooks/terms.pb.js, as lib/gen/legal.js), which accept
 * only this version and stamp the time themselves.
 *
 * Agreeing covers both documents. Move PRIVACY_UPDATED whenever
 * app/pages/privacy.vue changes, and TERMS_VERSION when either changes in a
 * way people should agree to again.
 */
export const TERMS_VERSION = '2026-11-16'
export const PRIVACY_UPDATED = '2026-11-19'

/** Whether `version` (users.terms_version) is the current Terms of Use. */
export function hasAgreed(version: unknown): boolean {
  return version === TERMS_VERSION
}

/** "November 16, 2026" for a YYYY-MM-DD version, spelled out so it reads the same everywhere. */
export function legalDate(version: string): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const [y, m, d] = version.split('-').map(Number)
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`
}
