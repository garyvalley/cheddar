/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Passkeys (WebAuthn), checked the way a browser's answer must be: the
// challenge Cheddar gave, Cheddar's own origin and site, a person present
// and verified on the device (Face ID, Touch ID, a PIN), and a signature by
// the key the passkey was registered with. PocketBase's JS has no ECDSA or
// RSA, so they're here: SHA-256, a small CBOR reader, P-256 ECDSA and RSA
// PKCS#1 v1.5 verification on BigInt. Verification only: nothing secret
// passes through, so there's no timing to hide.
//
// Plain values in and out (byte arrays, strings), so Node's tests run it
// against Node's own crypto (tests/webauthn.test.mjs).
// ---------------------------------------------------------------------------

// --- bytes -----------------------------------------------------------------

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

/** base64url (or base64) text to bytes; null when it isn't. */
function fromB64url(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9\-_+/]*={0,2}$/.test(text)) return null
  var s = text.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
  if (s.length % 4 === 1) return null
  var out = []
  var buf = 0
  var bits = 0
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s[i])
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 255)
    }
  }
  return out
}

function toB64url(bytes) {
  var out = ""
  for (var i = 0; i < bytes.length; i += 3) {
    var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]
    if (i + 2 < bytes.length) out += B64[n & 63]
  }
  return out
}

/** A string's UTF-8 bytes. */
function utf8Bytes(text) {
  var out = []
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i)
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00)
    }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

/** UTF-8 bytes to a string. */
function utf8Text(bytes) {
  var out = ""
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i]
    var c
    if (b < 0x80) c = b
    else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[++i] & 63)
    else if (b < 0xf0) c = ((b & 15) << 12) | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63)
    else c = ((b & 7) << 18) | ((bytes[++i] & 63) << 12) | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63)
    if (c >= 0x10000) {
      c -= 0x10000
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023))
    }
    else out += String.fromCharCode(c)
  }
  return out
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function toBig(bytes) {
  var hex = "0x0"
  for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16)
  return BigInt(hex)
}

function fromBig(n, length) {
  var hex = n.toString(16)
  if (hex.length % 2) hex = "0" + hex
  var out = []
  for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16))
  while (out.length < length) out.unshift(0)
  return out
}

// --- SHA-256 ---------------------------------------------------------------

var K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function sha256(bytes) {
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  var msg = bytes.slice()
  var bitLen = bytes.length * 8
  msg.push(0x80)
  while (msg.length % 64 !== 56) msg.push(0)
  for (var s = 7; s >= 0; s--) msg.push(s >= 4 ? 0 : (bitLen >>> (s * 8)) & 255)
  var w = new Array(64)
  for (var off = 0; off < msg.length; off += 64) {
    for (var t = 0; t < 16; t++) {
      var j = off + t * 4
      w[t] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) | 0
    }
    for (t = 16; t < 64; t++) {
      var a15 = w[t - 15]
      var a2 = w[t - 2]
      var s0 = ((a15 >>> 7) | (a15 << 25)) ^ ((a15 >>> 18) | (a15 << 14)) ^ (a15 >>> 3)
      var s1 = ((a2 >>> 17) | (a2 << 15)) ^ ((a2 >>> 19) | (a2 << 13)) ^ (a2 >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
    for (t = 0; t < 64; t++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      var ch = (e & f) ^ (~e & g)
      var t1 = (hh + S1 + ch + K[t] + w[t]) | 0
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      var maj = (a & b) ^ (a & c) ^ (b & c)
      var t2 = (S0 + maj) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  var out = []
  for (var i = 0; i < 8; i++) out.push((h[i] >>> 24) & 255, (h[i] >>> 16) & 255, (h[i] >>> 8) & 255, h[i] & 255)
  return out
}

// --- CBOR (what WebAuthn uses of it) ---------------------------------------

/** One CBOR item at `at` in `bytes`: { value, end }. Maps are objects keyed by String(key). Throws on what it can't read. */
function cborItem(bytes, at, depth) {
  if ((depth || 0) > 8) throw new Error("CBOR nested too deep")
  if (at >= bytes.length) throw new Error("CBOR ended early")
  var first = bytes[at++]
  var major = first >> 5
  var info = first & 31
  var len
  if (info < 24) len = info
  else if (info === 24) len = bytes[at++]
  else if (info === 25) { len = (bytes[at] << 8) | bytes[at + 1]; at += 2 }
  else if (info === 26) { len = ((bytes[at] << 24) >>> 0) + ((bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]); at += 4 }
  else if (info === 27) {
    len = 0
    for (var k = 0; k < 8; k++) len = len * 256 + bytes[at + k]
    at += 8
  }
  else throw new Error("CBOR length not supported")
  if (len === undefined || (major >= 2 && major <= 5 && len > bytes.length)) throw new Error("CBOR length too big")
  switch (major) {
    case 0: return { value: len, end: at }
    case 1: return { value: -1 - len, end: at }
    case 2:
      if (at + len > bytes.length) throw new Error("CBOR ended early")
      return { value: bytes.slice(at, at + len), end: at + len }
    case 3:
      if (at + len > bytes.length) throw new Error("CBOR ended early")
      return { value: utf8Text(bytes.slice(at, at + len)), end: at + len }
    case 4: {
      var list = []
      for (var i = 0; i < len; i++) {
        var item = cborItem(bytes, at, (depth || 0) + 1)
        list.push(item.value)
        at = item.end
      }
      return { value: list, end: at }
    }
    case 5: {
      var map = {}
      for (var m = 0; m < len; m++) {
        var key = cborItem(bytes, at, (depth || 0) + 1)
        var val = cborItem(bytes, key.end, (depth || 0) + 1)
        map[String(key.value)] = val.value
        at = val.end
      }
      return { value: map, end: at }
    }
    case 6: return cborItem(bytes, at, (depth || 0) + 1)
    case 7:
      if (info === 20) return { value: false, end: at }
      if (info === 21) return { value: true, end: at }
      if (info === 22) return { value: null, end: at }
      throw new Error("CBOR simple value not supported")
  }
  throw new Error("CBOR type not supported")
}

// --- P-256 ECDSA -----------------------------------------------------------

var P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff")
var N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
var B = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b")
var GX = BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296")
var GY = BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")
var ZERO = BigInt(0)
var ONE = BigInt(1)
var TWO = BigInt(2)
var THREE = BigInt(3)
var FOUR = BigInt(4)
var EIGHT = BigInt(8)

function mod(a, m) {
  var r = a % m
  return r < ZERO ? r + m : r
}

function modPow(base, exp, m) {
  var result = ONE
  base = mod(base, m)
  while (exp > ZERO) {
    if (exp & ONE) result = (result * base) % m
    base = (base * base) % m
    exp >>= ONE
  }
  return result
}

/** 1/a mod a prime m. */
function inv(a, m) {
  return modPow(a, m - TWO, m)
}

function onCurve(x, y) {
  if (x < ZERO || x >= P || y < ZERO || y >= P) return false
  return mod(y * y - (x * x * x - THREE * x + B), P) === ZERO
}

// Points in Jacobian coordinates [X, Y, Z]; Z = 0 is the point at infinity.
function double(pt) {
  var X = pt[0], Y = pt[1], Z = pt[2]
  if (Z === ZERO || Y === ZERO) return [ONE, ONE, ZERO]
  var delta = mod(Z * Z, P)
  var gamma = mod(Y * Y, P)
  var beta = mod(X * gamma, P)
  var alpha = mod(THREE * (X - delta) * (X + delta), P)
  var X3 = mod(alpha * alpha - EIGHT * beta, P)
  var Z3 = mod((Y + Z) * (Y + Z) - gamma - delta, P)
  var Y3 = mod(alpha * (FOUR * beta - X3) - EIGHT * gamma * gamma, P)
  return [X3, Y3, Z3]
}

function add(p1, p2) {
  if (p1[2] === ZERO) return p2
  if (p2[2] === ZERO) return p1
  var Z1Z1 = mod(p1[2] * p1[2], P)
  var Z2Z2 = mod(p2[2] * p2[2], P)
  var U1 = mod(p1[0] * Z2Z2, P)
  var U2 = mod(p2[0] * Z1Z1, P)
  var S1 = mod(p1[1] * p2[2] * Z2Z2, P)
  var S2 = mod(p2[1] * p1[2] * Z1Z1, P)
  var H = mod(U2 - U1, P)
  var r = mod(TWO * (S2 - S1), P)
  if (H === ZERO) return r === ZERO ? double(p1) : [ONE, ONE, ZERO]
  var I = mod(FOUR * H * H, P)
  var J = mod(H * I, P)
  var V = mod(U1 * I, P)
  var X3 = mod(r * r - J - TWO * V, P)
  var Y3 = mod(r * (V - X3) - TWO * S1 * J, P)
  var Z3 = mod(((p1[2] + p2[2]) * (p1[2] + p2[2]) - Z1Z1 - Z2Z2) * H, P)
  return [X3, Y3, Z3]
}

function multiply(k, pt) {
  var result = [ONE, ONE, ZERO]
  var bits = k.toString(2)
  for (var i = 0; i < bits.length; i++) {
    result = double(result)
    if (bits[i] === "1") result = add(result, pt)
  }
  return result
}

/** A DER ECDSA signature's r and s, or null. */
function derSignature(sig) {
  if (sig.length < 8 || sig[0] !== 0x30 || sig[1] !== sig.length - 2) return null
  var at = 2
  var parts = []
  for (var i = 0; i < 2; i++) {
    if (sig[at] !== 0x02) return null
    var len = sig[at + 1]
    if (len < 1 || len > 33 || at + 2 + len > sig.length) return null
    parts.push(toBig(sig.slice(at + 2, at + 2 + len)))
    at += 2 + len
  }
  return at === sig.length ? { r: parts[0], s: parts[1] } : null
}

/** Whether `sig` (DER) is P-256 ECDSA over SHA-256 of `message` by the key at `x`, `y` (bytes). */
function verifyES256(x, y, message, sig) {
  var qx = toBig(x)
  var qy = toBig(y)
  if (!onCurve(qx, qy)) return false
  var rs = derSignature(sig)
  if (!rs || rs.r < ONE || rs.r >= N || rs.s < ONE || rs.s >= N) return false
  var e = toBig(sha256(message))
  var w = inv(rs.s, N)
  var u1 = mod(e * w, N)
  var u2 = mod(rs.r * w, N)
  var pt = add(multiply(u1, [GX, GY, ONE]), multiply(u2, [qx, qy, ONE]))
  if (pt[2] === ZERO) return false
  var zinv = inv(pt[2], P)
  var ax = mod(pt[0] * zinv * zinv, P)
  return mod(ax, N) === rs.r
}

// --- RSA PKCS#1 v1.5 with SHA-256 ------------------------------------------

var SHA256_INFO = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20]

/** Whether `sig` is RS256 over `message` by the key with modulus `n` and exponent `e` (bytes). */
function verifyRS256(n, e, message, sig) {
  var mod_ = toBig(n)
  var k = n[0] === 0 ? n.length - 1 : n.length
  if (k < 256 || sig.length !== k) return false
  var s = toBig(sig)
  if (s >= mod_) return false
  var em = fromBig(modPow(s, toBig(e), mod_), k)
  var want = [0x00, 0x01]
  var digest = SHA256_INFO.concat(sha256(message))
  for (var i = 0; i < k - 3 - digest.length; i++) want.push(0xff)
  want.push(0x00)
  return sameBytes(em, want.concat(digest))
}

// --- WebAuthn --------------------------------------------------------------

var ES256 = -7
var RS256 = -257
/** Which signatures Cheddar takes, in the order it asks for them. */
var ALGORITHMS = [ES256, RS256]

/** The site a passkey belongs to and the page origin it's used from, from Cheddar's public address. Null without one. */
function siteOf(appUrl) {
  var m = /^(https?):\/\/([^/:?#]+)(:\d+)?/.exec(String(appUrl || ""))
  if (!m) return null
  if (m[1] === "http" && m[2] !== "localhost") return null
  return { rpId: m[2].toLowerCase(), origin: (m[1] + "://" + m[2] + (m[3] || "")).toLowerCase() }
}

function parseAuthData(bytes) {
  if (bytes.length < 37) throw new Error("authenticator data too short")
  var out = {
    rpIdHash: bytes.slice(0, 32),
    flags: bytes[32],
    signCount: ((bytes[33] << 24) >>> 0) + ((bytes[34] << 16) | (bytes[35] << 8) | bytes[36]),
  }
  if (out.flags & 0x40) {
    var at = 37 + 16
    var idLen = (bytes[at] << 8) | bytes[at + 1]
    at += 2
    if (idLen < 1 || idLen > 1023 || at + idLen > bytes.length) throw new Error("credential id doesn't fit")
    out.credentialId = bytes.slice(at, at + idLen)
    out.coseKey = cborItem(bytes, at + idLen).value
  }
  return out
}

/** A COSE public key as Cheddar keeps it: { alg, x, y } or { alg, n, e } in base64url. Null for any other kind. */
function keyOf(cose) {
  if (!cose || typeof cose !== "object") return null
  if (cose["1"] === 2 && cose["3"] === ES256 && cose["-1"] === 1) {
    var x = cose["-2"], y = cose["-3"]
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== 32 || y.length !== 32) return null
    if (!onCurve(toBig(x), toBig(y))) return null
    return { alg: ES256, x: toB64url(x), y: toB64url(y) }
  }
  if (cose["1"] === 3 && cose["3"] === RS256) {
    var n = cose["-1"], e = cose["-2"]
    if (!Array.isArray(n) || !Array.isArray(e) || n.length < 256 || n.length > 513 || e.length < 1 || e.length > 8) return null
    return { alg: RS256, n: toB64url(n), e: toB64url(e) }
  }
  return null
}

/** The browser's client data, checked: { problem } or the bytes it was. */
function clientData(json64, type, challenge, origin) {
  var bytes = fromB64url(json64)
  if (!bytes || bytes.length > 4096) return { problem: "That answer from your device couldn't be read." }
  var data
  try {
    data = JSON.parse(utf8Text(bytes))
  }
  catch (_) {
    return { problem: "That answer from your device couldn't be read." }
  }
  if (!data || data.type !== type) return { problem: "That answer from your device was for something else." }
  if (data.challenge !== challenge) return { problem: "That passkey request has expired. Try again." }
  if (String(data.origin).toLowerCase() !== origin) return { problem: "That passkey is for another site." }
  if (data.crossOrigin === true) return { problem: "That passkey is for another site." }
  return { bytes: bytes }
}

function presentAndVerified(auth, site) {
  if (!sameBytes(auth.rpIdHash, sha256(utf8Bytes(site.rpId)))) return "That passkey is for another site."
  if (!(auth.flags & 0x01) || !(auth.flags & 0x04)) return "Your device has to check it's you (Face ID, Touch ID or your PIN)."
  return ""
}

/**
 * A new passkey from the browser's answer to navigator.credentials.create()
 * (base64url fields `clientDataJSON` and `attestationObject`), against the
 * `challenge` Cheddar gave and its `site` (siteOf()). Attestation isn't
 * checked: Cheddar asks for none, and any authenticator will do. Answers
 * { credentialId, key, signCount } or { problem } in words.
 */
function checkRegistration(response, challenge, site) {
  var cd = clientData(response && response.clientDataJSON, "webauthn.create", challenge, site.origin)
  if (cd.problem) return cd
  var att = fromB64url(response.attestationObject)
  if (!att || att.length > 16384) return { problem: "That answer from your device couldn't be read." }
  var auth
  try {
    var obj = cborItem(att, 0).value
    if (!obj || !Array.isArray(obj.authData)) return { problem: "That answer from your device couldn't be read." }
    auth = parseAuthData(obj.authData)
  }
  catch (_) {
    return { problem: "That answer from your device couldn't be read." }
  }
  var problem = presentAndVerified(auth, site)
  if (problem) return { problem: problem }
  if (!auth.credentialId) return { problem: "That answer from your device couldn't be read." }
  var key = keyOf(auth.coseKey)
  if (!key) return { problem: "That kind of passkey isn't supported. Try another device." }
  return { credentialId: toB64url(auth.credentialId), key: key, signCount: auth.signCount }
}

/**
 * A sign-in with a passkey: the browser's answer to navigator.credentials.get()
 * (base64url `clientDataJSON`, `authenticatorData`, `signature`), against the
 * `challenge`, the `site`, and the passkey's stored `key` and `signCount`.
 * Answers { signCount } or { problem } in words.
 */
function checkAssertion(response, challenge, site, key, signCount) {
  var cd = clientData(response && response.clientDataJSON, "webauthn.get", challenge, site.origin)
  if (cd.problem) return cd
  var authBytes = fromB64url(response.authenticatorData)
  var sig = fromB64url(response.signature)
  if (!authBytes || !sig || authBytes.length > 2048 || sig.length > 1024) return { problem: "That answer from your device couldn't be read." }
  var auth
  try {
    auth = parseAuthData(authBytes)
  }
  catch (_) {
    return { problem: "That answer from your device couldn't be read." }
  }
  var problem = presentAndVerified(auth, site)
  if (problem) return { problem: problem }
  var signed = authBytes.concat(sha256(cd.bytes))
  var ok = key.alg === ES256
    ? verifyES256(fromB64url(key.x), fromB64url(key.y), signed, sig)
    : key.alg === RS256 && verifyRS256(fromB64url(key.n), fromB64url(key.e), signed, sig)
  if (!ok) return { problem: "That passkey didn't work." }
  // A counter that doesn't move on is a copied passkey (or one that never counts: both 0).
  if ((auth.signCount || signCount) && auth.signCount <= signCount) return { problem: "That passkey didn't work." }
  return { signCount: auth.signCount }
}

module.exports = {
  ALGORITHMS: ALGORITHMS,
  ES256: ES256,
  RS256: RS256,
  fromB64url: fromB64url,
  toB64url: toB64url,
  utf8Bytes: utf8Bytes,
  utf8Text: utf8Text,
  sha256: sha256,
  cborItem: cborItem,
  verifyES256: verifyES256,
  verifyRS256: verifyRS256,
  siteOf: siteOf,
  keyOf: keyOf,
  checkRegistration: checkRegistration,
  checkAssertion: checkAssertion,
}
