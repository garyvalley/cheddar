/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Time-based one-time codes (RFC 6238), as authenticator apps make them:
// HMAC-SHA1, 30-second steps, 6 digits, a base32 secret. For two-step
// sign-in (pb_hooks/two_step.pb.js).
//
// SHA-1 is written out here because the JSVM's $security offers HMAC only
// with SHA-256 and SHA-512, and many apps (Google Authenticator among them)
// only make SHA-1 codes. SHA-1's collision weakness does not touch HMAC.
//
// No $-globals, so tests/totp.test.mjs can run it against the RFC's test
// vectors.
// ---------------------------------------------------------------------------

var STEP_SECONDS = 30
var DIGITS = 6
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

/** Bytes of a base32 string (RFC 4648; padding, spaces and case ignored). */
function base32Decode(text) {
  var clean = String(text).toUpperCase().replace(/[\s=]/g, "")
  var bits = 0
  var value = 0
  var out = []
  for (var i = 0; i < clean.length; i++) {
    var v = BASE32.indexOf(clean[i])
    if (v < 0) throw new Error("not base32")
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return out
}

function rotl(x, n) { return (x << n) | (x >>> (32 - n)) }

/** SHA-1 of a byte array, as a byte array. */
function sha1(bytes) {
  var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  var msg = bytes.slice()
  var bitLen = bytes.length * 8
  msg.push(0x80)
  while (msg.length % 64 !== 56) msg.push(0)
  // Length as a 64-bit big-endian number; ours are far below 2^32 bits.
  msg.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff)

  var w = new Array(80)
  for (var off = 0; off < msg.length; off += 64) {
    for (var t = 0; t < 16; t++) {
      w[t] = (msg[off + t * 4] << 24) | (msg[off + t * 4 + 1] << 16) | (msg[off + t * 4 + 2] << 8) | msg[off + t * 4 + 3]
    }
    for (t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1)
    var a = h0, b = h1, c = h2, d = h3, e = h4
    for (t = 0; t < 80; t++) {
      var f, k
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      var temp = (rotl(a, 5) + f + e + k + w[t]) | 0
      e = d; d = c; c = rotl(b, 30); b = a; a = temp
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0
  }
  var out = []
  var hs = [h0, h1, h2, h3, h4]
  for (var i = 0; i < 5; i++) out.push((hs[i] >>> 24) & 0xff, (hs[i] >>> 16) & 0xff, (hs[i] >>> 8) & 0xff, hs[i] & 0xff)
  return out
}

/** HMAC-SHA1 (RFC 2104) of byte arrays. */
function hmacSha1(key, message) {
  if (key.length > 64) key = sha1(key)
  var inner = []
  var outer = []
  for (var i = 0; i < 64; i++) {
    var b = key[i] || 0
    inner.push(b ^ 0x36)
    outer.push(b ^ 0x5c)
  }
  return sha1(outer.concat(sha1(inner.concat(message))))
}

/** The code for time step `step` (seconds since the epoch / 30). */
function codeAt(secret, step, digits) {
  digits = digits || DIGITS
  // The step as an 8-byte big-endian counter. JS bit operators are 32-bit,
  // so the high half is divided out.
  var counter = [0, 0, 0, 0, 0, 0, 0, 0]
  var hi = Math.floor(step / 0x100000000)
  var lo = step >>> 0
  for (var i = 3; i >= 0; i--) { counter[i] = hi & 0xff; hi = hi >>> 8 }
  for (i = 7; i >= 4; i--) { counter[i] = lo & 0xff; lo = lo >>> 8 }

  var mac = hmacSha1(base32Decode(secret), counter)
  var o = mac[19] & 0x0f
  var bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]
  var code = String(bin % Math.pow(10, digits))
  while (code.length < digits) code = "0" + code
  return code
}

function stepAt(ms) { return Math.floor(ms / 1000 / STEP_SECONDS) }

/**
 * The time step `code` belongs to, or -1. Accepts the step before and after
 * the current one, for a phone clock a little off and a code typed as it
 * turned over. Steps at or before `lastStep` are refused, so a code works once.
 */
function matchStep(secret, code, nowMs, lastStep) {
  code = String(code || "").replace(/\s+/g, "")
  if (!/^\d{6}$/.test(code)) return -1
  var now = stepAt(nowMs)
  for (var s = now - 1; s <= now + 1; s++) {
    if (s > (lastStep || 0) && codeAt(secret, s) === code) return s
  }
  return -1
}

/** The otpauth:// address an authenticator app reads from the QR code. */
function otpauthUri(secret, account, issuer) {
  var label = encodeURIComponent(issuer) + ":" + encodeURIComponent(account)
  return "otpauth://totp/" + label + "?secret=" + secret + "&issuer=" + encodeURIComponent(issuer)
    + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + STEP_SECONDS
}

module.exports = {
  BASE32: BASE32,
  base32Decode: base32Decode,
  sha1: sha1,
  hmacSha1: hmacSha1,
  codeAt: codeAt,
  stepAt: stepAt,
  matchStep: matchStep,
  otpauthUri: otpauthUri,
}
