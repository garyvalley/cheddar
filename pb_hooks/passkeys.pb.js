/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Passkeys (glue/passkeys.js, lib/webauthn.js, issue #111): Face ID, Touch
// ID, a phone or a security key in place of the password and the code.
// A passkey checks who's there on the device itself, so it counts as both
// steps of sign-in on its own. Authenticator codes and recovery codes stay
// as they are, for a device without one.
//
//   GET  /api/passkeys                       -> { passkeys: [{ id, name, created, last_used }] }
//   POST /api/passkeys/options               { password } -> { challengeId, publicKey } for create()
//   POST /api/passkeys                       { challengeId, name, credential } -> { passkey }
//   POST /api/passkeys/{id}/remove           -> 204
//   POST /api/passkeys/sign-in/options       -> { challengeId, publicKey } for get()
//   POST /api/passkeys/sign-in               { challengeId, credential, mfaId? }
//
// Signing in: PocketBase's MFA (two_step.pb.js) wants two methods. After a
// password step (`mfaId` from it), a passkey is the second, and the answer
// is the auth response. On its own, a passkey's check is the first
// ("webauthn"): the answer is PocketBase's { mfaId }, and
//   POST /api/collections/users/auth-with-passkey { mfaId } -> the auth response
// finishes it, taking only an mfaId a passkey made. Nuxt makes both calls
// for the browser (server/data/passkeys.ts). Either way the sign-in's
// method is "passkey", which makes a device session (sessions.pb.js).
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/passkeys", (e) => {
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  return e.json(200, { passkeys: require(`${__hooks}/glue/passkeys.js`).list(e.app, e.auth.id) })
}, $apis.requireAuth("users"))

// Adding a passkey asks for the password, as setting up an app does: a
// passkey signs in on its own, so a session alone must not be enough.
routerAdd("POST", "/api/passkeys/options", (e) => {
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var user = e.app.findRecordById("users", e.auth.id)
  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }
  return e.json(200, require(`${__hooks}/glue/passkeys.js`).creationOptions(e.app, user))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/passkeys", (e) => {
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var user = e.app.findRecordById("users", e.auth.id)
  var passkey = require(`${__hooks}/glue/passkeys.js`).register(e.app, user, e.requestInfo().body || {})
  require(`${__hooks}/glue/events.js`).record(e.app, user.id, "passkey_added", e, passkey.name)
  require(`${__hooks}/glue/two_step.js`).notify(user, "passkeyAdded", passkey.name)
  return e.json(200, { passkey: passkey })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/passkeys/{id}/remove", (e) => {
  var name = require(`${__hooks}/glue/passkeys.js`).remove(e.app, e.auth.id, e.request.pathValue("id"))
  if (name === null) throw new NotFoundError("That passkey isn't there.")
  require(`${__hooks}/glue/events.js`).record(e.app, e.auth.id, "passkey_removed", e, name)
  return e.noContent(204)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/passkeys/sign-in/options", (e) => {
  return e.json(200, require(`${__hooks}/glue/passkeys.js`).requestOptions(e.app))
})

routerAdd("POST", "/api/passkeys/sign-in", (e) => {
  var body = e.requestInfo().body || {}
  var user = require(`${__hooks}/glue/passkeys.js`).signIn(e.app, body)
  // A passkey is only ever added with two-step sign-in on.
  if (!user.getBool("mfa_enabled")) throw new BadRequestError("Sign in with your password.")
  if (body.mfaId) {
    var after = require(`${__hooks}/glue/two_step.js`).passwordStepUser(body.mfaId)
    if (!after || after.id !== user.id) throw new BadRequestError("That passkey is for another account.")
    return $apis.recordAuthResponse(e, user, "passkey", null)
  }
  return $apis.recordAuthResponse(e, user, "webauthn", null)
})

routerAdd("POST", "/api/collections/users/auth-with-passkey", (e) => {
  var mfaId = String((e.requestInfo().body || {}).mfaId || "")
  var user = null
  try {
    var mfa = e.app.findRecordById("_mfas", mfaId)
    if (mfa.getString("method") === "webauthn" && mfa.getString("collectionRef") === e.app.findCollectionByNameOrId("users").id) {
      user = e.app.findRecordById("users", mfa.getString("recordRef"))
    }
  }
  catch (_) {
    /* the same answer */
  }
  if (!user) throw new BadRequestError("Sign in with your passkey again.")
  return $apis.recordAuthResponse(e, user, "passkey", null)
})
