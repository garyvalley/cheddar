import type { RecordAuthResponse, RecordModel } from 'pocketbase'
import { asSignUpMode, type SignUpMode } from '~~/shared/sign-up'
import { anonymous, type Session } from './session'

/**
 * Signing up and in, confirming an address, resetting or changing a password,
 * changing an email, two-step sign-in and deleting an account: the auth provider's contract as the
 * routes in server/api/auth/ use it. The bodies use PocketBase's users
 * collection and the routes in pb_hooks/.
 *
 * Asking for an email never says whether the address has an account.
 */

export type SignIn =
  | { token: string, record: RecordModel }
  | { mfaId: string }

/** A right password gives a token, or, with two-step sign-in on, an mfaId for the code step. Throws on a wrong one. */
export async function signInWithPassword(email: string, password: string): Promise<SignIn> {
  const pb = anonymous()
  try {
    const auth = await pb.collection('users').authWithPassword(email, password)
    return { token: auth.token, record: auth.record }
  }
  catch (error) {
    const mfaId = (error as { response?: { mfaId?: string } }).response?.mfaId
    if (mfaId) return { mfaId }
    throw error
  }
}

/** The code step: an authenticator code or a recovery code, after the password step's mfaId. */
export function signInWithCode(mfaId: string, code: string) {
  return anonymous().send<RecordAuthResponse & { meta?: { recovery_codes_left?: number } }>(
    '/api/collections/users/auth-with-app-code', { method: 'POST', body: { mfaId, code } })
}

/** The token's holder with a fresh token. */
export function refresh(s: Session) {
  return s.collection('users').authRefresh()
}

/** Who may sign up here (GET /api/sign-up in pb_hooks/signup.pb.js). Never the list of addresses. */
export async function signUpMode(): Promise<SignUpMode> {
  const { mode } = await anonymous().send<{ mode?: string }>('/api/sign-up', { method: 'GET' })
  return asSignUpMode(mode)
}

export async function register(input: { email: string, password: string, name: string }): Promise<void> {
  await anonymous().collection('users').create(
    { email: input.email, password: input.password, passwordConfirm: input.password, name: input.name })
}

export async function requestVerification(email: string): Promise<void> {
  await anonymous().collection('users').requestVerification(email)
}

export async function confirmVerification(token: string): Promise<void> {
  await anonymous().collection('users').confirmVerification(token)
}

export async function requestPasswordReset(email: string): Promise<void> {
  await anonymous().collection('users').requestPasswordReset(email)
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await anonymous().collection('users').confirmPasswordReset(token, password, password)
}

/** A new password, after the current one. Every other session ends; the token is this one's new one. */
export async function changePassword(s: Session, password: string, newPassword: string): Promise<string> {
  const { token } = await s.send<{ token: string }>('/api/change-password', { method: 'POST', body: { password, newPassword } })
  return token
}

/** After the current password, email a confirm link to `newEmail`, and a notice to the old address. */
export async function requestEmailChange(s: Session, password: string, newEmail: string): Promise<void> {
  await s.send('/api/request-email-change', { method: 'POST', body: { password, newEmail } })
}

/** The link's token and the password move the account to the new address, and end every session. */
export async function confirmEmailChange(token: string, password: string): Promise<void> {
  await anonymous().collection('users').confirmEmailChange(token, password)
}

/** Whether two-step sign-in is on, and how many recovery codes are left. */
export function twoStepStatus(s: Session): Promise<{ method: 'off' | 'app', recovery_codes_left: number }> {
  return s.send('/api/two-step', { method: 'GET' })
}

/** Start setting up an authenticator app: its secret and the address its QR code holds. */
export function setUpApp(s: Session, password: string): Promise<{ secret: string, uri: string }> {
  return s.send('/api/two-step/app', { method: 'POST', body: { password } })
}

/** The app's first code turns two-step sign-in on; answers with the recovery codes, shown only now. */
export function confirmApp(s: Session, code: string): Promise<{ recovery_codes: string[] }> {
  return s.send('/api/two-step/app/confirm', { method: 'POST', body: { code } })
}

/** New recovery codes in place of the old ones. */
export function newRecoveryCodes(s: Session, password: string): Promise<{ recovery_codes: string[] }> {
  return s.send('/api/two-step/recovery-codes', { method: 'POST', body: { password } })
}

/** Ends every session the account has, this one included. */
export async function signOutEverywhere(s: Session): Promise<void> {
  await s.send('/api/sign-out-everywhere', { method: 'POST' })
}

export async function deleteAccount(s: Session, password: string): Promise<void> {
  await s.send('/api/delete-account', { method: 'POST', body: { password } })
}
