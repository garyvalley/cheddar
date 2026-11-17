import type { RecordAuthResponse } from 'pocketbase'
import type { Passkey, PasskeyAnswer, PasskeyOptions } from '~~/shared/passkeys'
import { anonymous, type Session } from './session'

/**
 * Passkeys (shared/passkeys.ts), through pb_hooks/passkeys.pb.js: the
 * person's own list, adding and removing one, and signing in with one.
 */

export async function listPasskeys(s: Session): Promise<Passkey[]> {
  return (await s.send<{ passkeys: Passkey[] }>('/api/passkeys', { method: 'GET' })).passkeys
}

/** Starts adding a passkey: the password, then what the browser asks the device. */
export function passkeyOptions(s: Session, password: string): Promise<PasskeyOptions> {
  return s.send('/api/passkeys/options', { method: 'POST', body: { password } })
}

export async function addPasskey(s: Session, challengeId: string, name: string, credential: PasskeyAnswer): Promise<Passkey> {
  return (await s.send<{ passkey: Passkey }>('/api/passkeys', { method: 'POST', body: { challengeId, name, credential } })).passkey
}

export async function removePasskey(s: Session, id: string): Promise<void> {
  await s.send(`/api/passkeys/${encodeURIComponent(id)}/remove`, { method: 'POST' })
}

/** What the browser asks the device to sign in. */
export function signInOptions(device: Record<string, string> = {}): Promise<PasskeyOptions> {
  return anonymous(device).send('/api/passkeys/sign-in/options', { method: 'POST' })
}

type Auth = RecordAuthResponse & { meta?: { session?: string } }

/**
 * Signs in with a passkey's answer: after the password step (`mfaId`), or
 * on its own, when the hooks' first answer is PocketBase's { mfaId } and a
 * second call finishes it (pb_hooks/passkeys.pb.js says why).
 */
export async function signInWithPasskey(
  challengeId: string,
  credential: PasskeyAnswer,
  mfaId: string,
  device: Record<string, string> = {},
): Promise<Auth> {
  const pb = anonymous(device)
  try {
    return await pb.send<Auth>('/api/passkeys/sign-in', { method: 'POST', body: { challengeId, credential, ...(mfaId ? { mfaId } : {}) } })
  }
  catch (error) {
    const next = (error as { response?: { mfaId?: string } }).response?.mfaId
    if (!next || mfaId) throw error
    return await pb.send<Auth>('/api/collections/users/auth-with-passkey', { method: 'POST', body: { mfaId: next } })
  }
}
