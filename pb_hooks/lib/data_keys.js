/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// The keys Cheddar encrypts what it keeps secret with: each two-step app's
// secret (user_totp.secret, pending_secret), each bank link's access token
// (bank_links.access), and the key recovery codes are hashed with. A copy of
// the database alone then gives none of them away (issue #39).
//
// DATA_KEYS lists them newest first, "v2:<32 characters>,v1:<32 characters>".
// A value is sealed with the first and carries its id ("v2:<ciphertext>"),
// so it opens with whichever key made it, and an old key can be retired once
// nothing carries its id any more (pb_hooks/data_keys.pb.js re-seals every
// value with the newest key). BANK_LINK_KEY, from before DATA_KEYS, is key
// "v1" when DATA_KEYS doesn't name one: bank links sealed with it carry no
// id, and open with v1.
//
// Plain values in and out, with $security's encrypt, decrypt and hs256 passed
// in, so Node can run it; pb_hooks/glue/data_keys.js reads the environment.
// ---------------------------------------------------------------------------

var ID = /^[a-z0-9]{1,8}$/
var LEGACY_ID = "v1"

/**
 * The key set from DATA_KEYS and BANK_LINK_KEY's text: `{ current, keys }`,
 * `current` the id new values are sealed with ("" for none) and `keys` each
 * id's key. `problems` lists entries left out (a bad id or a key that isn't
 * 32 characters), without the keys.
 */
function parse(dataKeys, bankLinkKey) {
  var keys = {}
  var order = []
  var problems = []
  String(dataKeys || "").split(",").forEach(function (entry, i) {
    var text = entry.trim()
    if (!text) return
    var at = text.indexOf(":")
    var id = at < 0 ? "" : text.slice(0, at).trim()
    var key = at < 0 ? "" : text.slice(at + 1).trim()
    if (!ID.test(id) || key.length !== 32 || keys[id]) {
      problems.push("DATA_KEYS entry " + (i + 1) + (ID.test(id) ? " (" + id + ")" : "") + " left out: it must be id:<32 characters>, each id once")
      return
    }
    keys[id] = key
    order.push(id)
  })
  var legacy = String(bankLinkKey || "")
  if (legacy.length === 32 && !keys[LEGACY_ID]) {
    keys[LEGACY_ID] = legacy
    order.push(LEGACY_ID)
  }
  return { current: order[0] || "", keys: keys, problems: problems }
}

/** Whether there is a key to seal with. */
function hasKey(set) {
  return !!set.current
}

/** The id a stored value was sealed with, or "" when it carries none. */
function idOf(value) {
  var m = /^([a-z0-9]{1,8}):/.exec(String(value || ""))
  return m ? m[1] : ""
}

/**
 * `plain` sealed with the newest key, as "<id>:<ciphertext>". With no key it
 * stays as it is: a Cheddar with no DATA_KEYS keeps two-step secrets as
 * before, and can't link banks.
 */
function seal(set, plain, encrypt) {
  if (!plain || !set.current) return plain || ""
  return set.current + ":" + encrypt(String(plain), set.keys[set.current])
}

/**
 * What a stored value holds, or null when its key is gone or it won't
 * decrypt. A value with no id is `legacy`: "plain" (two-step secrets from
 * before encryption) or "v1" (bank links sealed with BANK_LINK_KEY alone).
 */
function open(set, value, decrypt, legacy) {
  var text = String(value || "")
  if (!text) return ""
  var id = idOf(text)
  var body = id ? text.slice(id.length + 1) : text
  if (!id && legacy === "plain") return text
  if (!id) id = LEGACY_ID
  var key = set.keys[id]
  if (!key) return null
  try {
    var out = decrypt(body, key)
    return out ? String(out) : null
  }
  catch (_) {
    return null
  }
}

/** Whether a stored value is already sealed with the newest key (empty counts). */
function isCurrent(set, value) {
  return !value || !set.current || idOf(value) === set.current
}

/** The HMAC key for recovery codes, made from a data key, so no key does two jobs. */
function codeKey(key, hs256) {
  return hs256("cheddar recovery codes", key)
}

/**
 * A recovery code's stored hash: "<id>:" and an HMAC of the code with the
 * newest key, or the bare SHA-256 recovery codes had before, with no key.
 */
function hashCode(set, raw, sha256, hs256) {
  if (!set.current) return sha256(raw)
  return set.current + ":" + hs256(raw, codeKey(set.keys[set.current], hs256))
}

/** Whether `raw` is the code a stored hash was made from, either kind. */
function codeMatches(set, stored, raw, sha256, hs256) {
  var id = idOf(stored)
  if (!id) return stored === sha256(raw)
  var key = set.keys[id]
  return !!key && stored === id + ":" + hs256(raw, codeKey(key, hs256))
}

module.exports = {
  LEGACY_ID: LEGACY_ID,
  parse: parse,
  hasKey: hasKey,
  idOf: idOf,
  seal: seal,
  open: open,
  isCurrent: isCurrent,
  hashCode: hashCode,
  codeMatches: codeMatches,
}
