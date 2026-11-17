// A passkey device for tests: makes the answers a browser gives to
// navigator.credentials.create() and .get(), signed with Node's own crypto,
// so pb_hooks/lib/webauthn.js is checked against an independent signer.

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'

const b64url = buf => Buffer.from(buf).toString('base64url')
const sha256 = buf => createHash('sha256').update(buf).digest()

// CBOR, enough for an attestation object and a COSE key.
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n])
  if (n < 256) return Buffer.from([(major << 5) | 24, n])
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b
}
export function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (typeof v === 'string') { const s = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, s.length), s]) }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v])
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])])
  throw new Error('cbor: unsupported')
}

/**
 * A device holding one passkey for `rpId`, used from `origin`. `kind` is
 * 'ec' (ES256, what phones and laptops make) or 'rsa' (RS256, Windows
 * Hello's). `flags` overrides what the device says (0x05: present and verified).
 */
export function device({ origin, rpId, kind = 'ec', flags = 0x05 } = {}) {
  const keys = kind === 'rsa'
    ? generateKeyPairSync('rsa', { modulusLength: 2048 })
    : generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = keys.publicKey.export({ format: 'jwk' })
  const cose = kind === 'rsa'
    ? new Map([[1, 3], [3, -257], [-1, Buffer.from(jwk.n, 'base64url')], [-2, Buffer.from(jwk.e, 'base64url')]])
    : new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
  const credentialId = randomBytes(16)
  let counter = 0
  const authData = (extra, flagBits) => {
    const count = Buffer.alloc(4); count.writeUInt32BE(counter)
    return Buffer.concat([sha256(Buffer.from(rpId)), Buffer.from([flagBits]), count, extra])
  }
  const client = (type, challenge, over = {}) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...over }))
  return {
    id: b64url(credentialId),
    /** The answer to create() for `challenge` (base64url). */
    create(challenge, over = {}) {
      const idLen = Buffer.alloc(2); idLen.writeUInt16BE(credentialId.length)
      const attested = Buffer.concat([Buffer.alloc(16), idLen, credentialId, cbor(cose)])
      const att = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData(attested, (over.flags ?? flags) | 0x40)]]))
      return { id: b64url(credentialId), clientDataJSON: b64url(client('webauthn.create', challenge, over.client)), attestationObject: b64url(att) }
    },
    /** The answer to get() for `challenge`: the counter moves on unless `same`. */
    get(challenge, over = {}) {
      if (!over.same) counter++
      const data = authData(Buffer.alloc(0), over.flags ?? flags)
      const cd = client('webauthn.get', challenge, over.client)
      const signature = sign('sha256', Buffer.concat([data, sha256(cd)]), keys.privateKey)
      return { id: b64url(credentialId), clientDataJSON: b64url(cd), authenticatorData: b64url(data), signature: b64url(signature), userHandle: over.userHandle ?? '' }
    },
  }
}
