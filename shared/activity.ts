/**
 * Settings → Recent activity: what happened on a person's account, from the
 * `security_events` rows only the hooks write (pb_hooks/glue/events.js).
 * Kept 90 days.
 */

export const ACTIVITY_KINDS = [
  'sign_in',
  'code_wrong',
  'codes_locked',
  'two_step_changed',
  'recovery_codes_new',
  'password_changed',
  'email_changed',
  'signed_out_everywhere',
  'bank_linked',
  'bank_unlinked',
  'export',
] as const

export type ActivityKind = typeof ACTIVITY_KINDS[number]

export interface ActivityEvent {
  kind: ActivityKind
  /** The device it came from ("Safari on iPhone"), or "". */
  device: string
  /** A two-letter country, or "". */
  place: string
  /** A bank's name, for a link or an unlink; otherwise "". */
  detail: string
  /** PocketBase's created time. */
  created: string
}

/** How many Settings shows. */
export const ACTIVITY_SHOWN = 20

const SAID: Record<ActivityKind, string> = {
  sign_in: 'Signed in',
  code_wrong: 'Wrong two-step code after a right password',
  codes_locked: 'Two-step sign-in locked after wrong codes',
  two_step_changed: 'Authenticator app set up',
  recovery_codes_new: 'New recovery codes made',
  password_changed: 'Password changed',
  email_changed: 'Email changed',
  signed_out_everywhere: 'Signed out everywhere',
  bank_linked: 'Bank linked',
  bank_unlinked: 'Bank unlinked',
  export: 'Data exported',
}

/** What a row says, in words: "Bank linked: Chase". */
export function describeActivity(e: Pick<ActivityEvent, 'kind' | 'detail'>): string {
  const said = SAID[e.kind] ?? 'Account activity'
  return e.detail ? `${said}: ${e.detail}` : said
}

/** Whether a row is one the person should look at twice (someone with the password, or a lock). */
export function isWarning(kind: ActivityKind): boolean {
  return kind === 'code_wrong' || kind === 'codes_locked'
}
