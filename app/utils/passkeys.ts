import type { PasskeyAnswer, PasskeyOptions } from '~~/shared/passkeys'

// The browser's half of passkeys (shared/passkeys.ts): turning the hooks'
// base64url options into what WebAuthn takes, and the device's answer back.

const toBytes = (b64url: string) => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}
const toB64url = (buf: ArrayBuffer | null | undefined) => {
  if (!buf) return ''
  let bin = ''
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Whether this browser can use passkeys at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials
}

/** What a device's refusal means, in words; '' when the person just cancelled. */
export function passkeyProblem(error: unknown): string {
  const name = (error as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError') return ''
  if (name === 'InvalidStateError') return 'That device already has a passkey for this account.'
  if (name === 'SecurityError') return 'Passkeys only work on this Cheddar\'s own address.'
  return 'Your device couldn\'t use a passkey just now.'
}

/** Asks the device to make a passkey: its answer. Throws the browser's error when it can't or the person cancels. */
export async function makePasskey(options: PasskeyOptions['publicKey']): Promise<PasskeyAnswer> {
  // The hooks' options, as WebAuthn's types have them but with base64url text for bytes.
  type Wire = Omit<PublicKeyCredentialCreationOptions, 'challenge' | 'user' | 'excludeCredentials'> & {
    challenge: string
    user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string }
    excludeCredentials?: { id: string, type: 'public-key' }[]
  }
  const o = options as unknown as Wire
  const cred = await navigator.credentials.create({
    publicKey: {
      ...o,
      challenge: toBytes(o.challenge),
      user: { ...o.user, id: toBytes(o.user.id) },
      excludeCredentials: (o.excludeCredentials ?? []).map(c => ({ ...c, id: toBytes(c.id) })),
    },
  }) as PublicKeyCredential
  const res = cred.response as AuthenticatorAttestationResponse
  return { id: cred.id, clientDataJSON: toB64url(res.clientDataJSON), attestationObject: toB64url(res.attestationObject) }
}

/** Asks the device to sign in with a passkey: its answer. */
export async function signWithPasskey(options: PasskeyOptions['publicKey']): Promise<PasskeyAnswer> {
  const o = options as unknown as Omit<PublicKeyCredentialRequestOptions, 'challenge'> & { challenge: string }
  const cred = await navigator.credentials.get({
    publicKey: { ...o, challenge: toBytes(o.challenge) },
  }) as PublicKeyCredential
  const res = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    clientDataJSON: toB64url(res.clientDataJSON),
    authenticatorData: toB64url(res.authenticatorData),
    signature: toB64url(res.signature),
    userHandle: toB64url(res.userHandle),
  }
}
