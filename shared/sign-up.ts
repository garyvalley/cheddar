/**
 * Who may make an account here, from PocketBase's SIGNUP setting
 * (pb_hooks/lib/signup.js): anyone, only the addresses on its list, or nobody.
 */
export type SignUpMode = 'open' | 'invite' | 'closed'

export const SIGN_UP_MODES: readonly SignUpMode[] = ['open', 'invite', 'closed']

/** PocketBase's answer as a mode; anything else reads as open, so the form shows and the hook has the last word. */
export function asSignUpMode(value: unknown): SignUpMode {
  return SIGN_UP_MODES.includes(value as SignUpMode) ? value as SignUpMode : 'open'
}
