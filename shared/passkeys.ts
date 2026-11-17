/**
 * Passkeys (issue #111): sign in with Face ID, Touch ID, a phone or a
 * security key, in place of the password and the code. The hooks check
 * everything (pb_hooks/passkeys.pb.js, lib/webauthn.js); these are the
 * shapes the app and the routes share.
 */

/** A passkey as Settings lists it. */
export interface Passkey {
  id: string
  name: string
  /** PocketBase's date format. */
  created: string
  /** PocketBase's date format, or '' before it's been used. */
  last_used: string
}

/** What the browser asks the device, with base64url where WebAuthn wants bytes, and the challenge's id to send back. */
export interface PasskeyOptions {
  challengeId: string
  publicKey: Record<string, unknown>
}

/** The browser's answer, each byte field as base64url. */
export interface PasskeyAnswer {
  id: string
  clientDataJSON: string
  attestationObject?: string
  authenticatorData?: string
  signature?: string
  userHandle?: string
}

/** The longest name a passkey can have. */
export const PASSKEY_NAME_MAX = 60
