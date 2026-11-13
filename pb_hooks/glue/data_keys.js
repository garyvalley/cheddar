/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/data_keys.js with the environment read and $security's crypto passed
// in, and the re-seal that moves every stored secret to the newest key.
// Required inside a handler body, like every glue module.
// ---------------------------------------------------------------------------

var dataKeys = require(`${__hooks}/lib/data_keys.js`)

/** DATA_KEYS, with BANK_LINK_KEY as key v1 when it names none. */
function set() {
  var got = dataKeys.parse($os.getenv("DATA_KEYS"), $os.getenv("BANK_LINK_KEY"))
  got.problems.forEach(function (p) { console.log("[data_keys] " + p) })
  return got
}

function encrypt(text, key) {
  return $security.encrypt(text, key)
}

function decrypt(text, key) {
  return toString($security.decrypt(text, key))
}

/** Whether there's a key to seal with. */
function hasKey() {
  return dataKeys.hasKey(set())
}

/** `plain` sealed with the newest key ("<id>:..."), or as it is with none. */
function seal(plain) {
  return dataKeys.seal(set(), plain, encrypt)
}

/** A stored value opened, or null when it can't be. `legacy`: "plain" or "v1" for a value with no id. */
function open(value, legacy) {
  return dataKeys.open(set(), value, decrypt, legacy)
}

/** What a recovery code is stored as. */
function hashCode(raw) {
  return dataKeys.hashCode(set(), raw, $security.sha256, $security.hs256)
}

/** A `matches(stored, raw)` for lib/two_step.js acceptCode, on one read of the keys. */
function codeMatcher() {
  var keys = set()
  return function (stored, raw) {
    return dataKeys.codeMatches(keys, stored, raw, $security.sha256, $security.hs256)
  }
}

// Each stored secret, and how one with no key id reads.
var FIELDS = [
  { collection: "user_totp", field: "secret", legacy: "plain" },
  { collection: "user_totp", field: "pending_secret", legacy: "plain" },
  { collection: "bank_links", field: "access", legacy: "v1" },
]

/**
 * Seals every stored secret not on the newest key with it. Returns
 * `{ current, resealed, unreadable, codes_on_old_keys }`: `unreadable` values
 * are on a key no longer in DATA_KEYS and are left as they are (a bank link
 * the person must link again); recovery codes can't be re-hashed without the
 * codes, so `codes_on_old_keys` counts the people whose codes still need an
 * old key (or none) until they make new ones.
 */
function resealAll(app) {
  var keys = set()
  var out = { current: keys.current, resealed: 0, unreadable: 0, codes_on_old_keys: 0 }
  if (!keys.current) return out
  FIELDS.forEach(function (f) {
    var rows = app.findRecordsByFilter(f.collection, f.field + " != ''", "", 0, 0)
    rows.forEach(function (row) {
      var value = row.getString(f.field)
      if (dataKeys.isCurrent(keys, value)) return
      var plain = dataKeys.open(keys, value, decrypt, f.legacy)
      if (plain === null) {
        out.unreadable++
        return
      }
      row.set(f.field, dataKeys.seal(keys, plain, encrypt))
      app.save(row)
      out.resealed++
    })
  })
  app.findRecordsByFilter("user_totp", "recovery_codes != ''", "", 0, 0).forEach(function (row) {
    var hashes = require(`${__hooks}/lib/two_step.js`).recoveryHashes(row.getString("recovery_codes"))
    if (hashes.some(function (h) { return dataKeys.idOf(h) !== keys.current })) out.codes_on_old_keys++
  })
  return out
}

module.exports = {
  set: set,
  hasKey: hasKey,
  seal: seal,
  open: open,
  hashCode: hashCode,
  codeMatcher: codeMatcher,
  resealAll: resealAll,
}
