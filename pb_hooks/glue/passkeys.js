/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/webauthn.js applied to records (pb_hooks/passkeys.pb.js): challenges,
// the passkeys each person has, and checking a browser's answer against
// them. Required inside a handler body, not at file scope (glue/bank_links.js
// says why).
// ---------------------------------------------------------------------------

var webauthn = require(`${__hooks}/lib/webauthn.js`)

var CHALLENGE_MS = 5 * 60 * 1000
/** The most passkeys one person can have. */
var MAX_PASSKEYS = 10

/** Cheddar's site and origin (APP_URL), or a 400 saying passkeys aren't set up here. */
function site() {
  var s = webauthn.siteOf($os.getenv("APP_URL"))
  if (!s) throw new BadRequestError("Passkeys need this Cheddar's public address (APP_URL) on https.")
  return s
}

/** A fresh one-time challenge for `purpose`, kept 5 minutes: { id, challenge }. */
function newChallenge(app, purpose, userId) {
  // Old ones go as new ones come, so the collection stays small.
  try {
    app.findRecordsByFilter("passkey_challenges", "expires < {:now}", "", 200, 0, { now: Date.now() }).forEach(function (r) {
      app.delete(r)
    })
  }
  catch (_) {
    /* tidy next time */
  }
  var row = new Record(app.findCollectionByNameOrId("passkey_challenges"))
  var challenge = webauthn.toB64url(webauthn.utf8Bytes($security.randomString(43)))
  row.set("challenge", challenge)
  row.set("purpose", purpose)
  if (userId) row.set("user", userId)
  row.set("expires", Date.now() + CHALLENGE_MS)
  app.save(row)
  return { id: row.id, challenge: challenge }
}

/** Takes a challenge (once: it's deleted) if it's for `purpose`, `userId` and still fresh; its text, or "". */
function takeChallenge(app, id, purpose, userId) {
  var row
  try {
    row = app.findRecordById("passkey_challenges", String(id || ""))
  }
  catch (_) {
    return ""
  }
  app.delete(row)
  if (row.getString("purpose") !== purpose || row.getInt("expires") < Date.now()) return ""
  if (userId && row.getString("user") !== userId) return ""
  return row.getString("challenge")
}

function listOf(app, userId) {
  return app.findRecordsByFilter("passkeys", "owner = {:owner}", "created", 0, 0, { owner: userId })
}

function summary(r) {
  return { id: r.id, name: r.getString("name"), created: r.getString("created"), last_used: r.getString("last_used") }
}

/** What navigator.credentials.create() is asked, for `user`, with base64url where the browser wants bytes. */
function creationOptions(app, user) {
  var s = site()
  var c = newChallenge(app, "register", user.id)
  return {
    challengeId: c.id,
    publicKey: {
      challenge: c.challenge,
      rp: { id: s.rpId, name: "Cheddar" },
      user: { id: webauthn.toB64url(webauthn.utf8Bytes(user.id)), name: user.getString("email"), displayName: user.getString("name") || user.getString("email") },
      pubKeyCredParams: webauthn.ALGORITHMS.map(function (alg) {
        return { type: "public-key", alg: alg }
      }),
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: listOf(app, user.id).map(function (r) {
        return { type: "public-key", id: r.getString("credential_id") }
      }),
      attestation: "none",
      timeout: CHALLENGE_MS,
    },
  }
}

/** Saves a new passkey from the browser's answer. Answers its summary; throws a 400 in words. */
function register(app, user, body) {
  var challenge = takeChallenge(app, body.challengeId, "register", user.id)
  if (!challenge) throw new BadRequestError("That passkey request has expired. Try again.")
  if (listOf(app, user.id).length >= MAX_PASSKEYS) throw new BadRequestError("You can have at most " + MAX_PASSKEYS + " passkeys. Remove one first.")
  var got = webauthn.checkRegistration(body.credential || {}, challenge, site())
  if (got.problem) throw new BadRequestError(got.problem)
  var known = false
  try {
    app.findFirstRecordByFilter("passkeys", "credential_id = {:id}", { id: got.credentialId })
    known = true
  }
  catch (_) {
    /* a new one */
  }
  if (known) throw new BadRequestError("That passkey is already added.")
  var row = new Record(app.findCollectionByNameOrId("passkeys"))
  row.set("owner", user.id)
  row.set("credential_id", got.credentialId)
  row.set("public_key", JSON.stringify(got.key))
  row.set("sign_count", got.signCount)
  row.set("name", String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60) || "Passkey")
  app.save(row)
  return summary(row)
}

/** What navigator.credentials.get() is asked: any of this site's passkeys. */
function requestOptions(app) {
  var s = site()
  var c = newChallenge(app, "sign_in", "")
  return {
    challengeId: c.id,
    publicKey: { challenge: c.challenge, rpId: s.rpId, userVerification: "required", timeout: CHALLENGE_MS },
  }
}

/** The person a sign-in answer proves, with their passkey's counter moved on; throws a 400 in words. */
function signIn(app, body) {
  var challenge = takeChallenge(app, body.challengeId, "sign_in", "")
  if (!challenge) throw new BadRequestError("That passkey request has expired. Try again.")
  var credential = body.credential || {}
  var row
  try {
    row = app.findFirstRecordByFilter("passkeys", "credential_id = {:id}", { id: String(credential.id || "") })
  }
  catch (_) {
    throw new BadRequestError("That passkey isn't one Cheddar knows. Sign in with your password, then add it in Settings.")
  }
  var got = webauthn.checkAssertion(credential, challenge, site(), JSON.parse(row.getString("public_key")), row.getInt("sign_count"))
  if (got.problem) throw new BadRequestError(got.problem)
  var owner = row.getString("owner")
  if (credential.userHandle && credential.userHandle !== webauthn.toB64url(webauthn.utf8Bytes(owner)))
    throw new BadRequestError("That passkey didn't work.")
  row.set("sign_count", got.signCount)
  row.set("last_used", new Date().toISOString().replace("T", " "))
  app.save(row)
  return app.findRecordById("users", owner)
}

/** Removes one of `userId`'s passkeys. Answers its name, or null when it isn't theirs. */
function remove(app, userId, id) {
  try {
    var row = app.findRecordById("passkeys", String(id || ""))
    if (row.getString("owner") !== userId) return null
    app.delete(row)
    return row.getString("name")
  }
  catch (_) {
    return null
  }
}

module.exports = {
  MAX_PASSKEYS: MAX_PASSKEYS,
  list: function (app, userId) {
    return listOf(app, userId).map(summary)
  },
  creationOptions: creationOptions,
  register: register,
  requestOptions: requestOptions,
  signIn: signIn,
  remove: remove,
}
