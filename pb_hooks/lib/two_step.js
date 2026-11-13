/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Two-step sign-in with an authenticator app: its codes and its recovery
// codes (pb_hooks/two_step.pb.js; schema and reasons in
// migrations/0001_accounts.mjs). Plain values in and out, with
// hashing and randomness passed in, so Node can run it;
// pb_hooks/glue/two_step.js loads and changes the user_totp row.
// ---------------------------------------------------------------------------

var totp = require(`${__hooks}/lib/totp.js`)

/** No 0/o, 1/i/l: a recovery code is read off paper and typed by hand. */
var RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
var RECOVERY_COUNT = 10

/** "off" or "app": what the person is asked for after their password. */
function method(mfaEnabled, appSecret) {
  return mfaEnabled && appSecret ? "app" : "off"
}

/** A recovery code as typed: case, spaces and dashes don't matter. */
function normaliseRecoveryCode(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Ten characters shown as two groups of five. */
function formatRecoveryCode(raw) {
  return raw.slice(0, 5) + "-" + raw.slice(5)
}

/** The hashes in a stored recovery_codes value (JSON text), or none. */
function recoveryHashes(stored) {
  try {
    var list = JSON.parse(stored || "[]")
    return Array.isArray(list) ? list : []
  }
  catch (_) {
    return []
  }
}

/**
 * Ten new recovery codes: `codes` to show once, formatted, and the `hashes`
 * to store. `random(length, alphabet)` is $security's in PocketBase, and
 * `hash(raw)` makes what is stored (lib/data_keys.js hashCode: an HMAC with
 * the newest data key).
 */
function newRecoveryCodes(random, hash) {
  var codes = []
  var hashes = []
  for (var i = 0; i < RECOVERY_COUNT; i++) {
    var raw = random(10, RECOVERY_ALPHABET) // 49 bits
    codes.push(formatRecoveryCode(raw))
    hashes.push(hash(raw))
  }
  return { codes: codes, hashes: hashes }
}

/**
 * Checks a code at sign-in against `row` ({secret, last_step, hashes}): six
 * digits from the app, or an unused recovery code. Returns `kind` "app",
 * "recovery" or "" for a wrong one, and what to store to spend what it
 * accepted: the app's `last_step`, or the recovery `hashes` left.
 * `matches(stored, raw)` says whether a stored hash is the code's
 * (lib/data_keys.js codeMatches).
 */
function acceptCode(row, code, now, matches) {
  var digits = String(code || "").replace(/\s+/g, "")
  if (/^\d{6}$/.test(digits)) {
    var step = totp.matchStep(row.secret, digits, now, row.last_step)
    return step < 0 ? { kind: "" } : { kind: "app", last_step: step }
  }
  var raw = normaliseRecoveryCode(code)
  var at = -1
  for (var i = 0; i < row.hashes.length && at < 0; i++) {
    if (matches(row.hashes[i], raw)) at = i
  }
  if (at < 0) return { kind: "" }
  var left = row.hashes.slice()
  left.splice(at, 1)
  return { kind: "recovery", hashes: left }
}

module.exports = {
  method: method,
  normaliseRecoveryCode: normaliseRecoveryCode,
  formatRecoveryCode: formatRecoveryCode,
  recoveryHashes: recoveryHashes,
  newRecoveryCodes: newRecoveryCodes,
  acceptCode: acceptCode,
}
