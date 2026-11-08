/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Two-step sign-in: password, then a code from an authenticator app or a
// recovery code. There are no emailed codes: whoever can read the inbox can
// also reset the password, so email is no second factor.
//
// PocketBase's MFA does the pairing: the users collection's MFA rule is
// `mfa_enabled = true`, so a right password on such an account answers with
// an mfaId instead of a token, and the app code below finishes the sign-in.
//
//   GET  /api/two-step                  -> { method, recovery_codes_left }
//   POST /api/two-step/off              { password }: two-step sign-in off
//   POST /api/two-step/app              { password } -> { secret, uri } to set up an app
//   POST /api/two-step/app/confirm      { code } -> { recovery_codes }; the app is on
//   POST /api/two-step/recovery-codes   { password } -> { recovery_codes }, replacing the old
//   POST /api/collections/users/auth-with-app-code  { mfaId, code } -> the auth response
// ---------------------------------------------------------------------------

// No emailed codes, ever. The collection has OTP on only because PocketBase
// requires a second built-in method for MFA (migrations/0001_accounts.mjs).
onRecordRequestOTPRequest(() => {
  throw new BadRequestError("Sign-in codes come from your authenticator app.")
}, "users")

onRecordAuthWithOTPRequest(() => {
  throw new BadRequestError("Sign-in codes come from your authenticator app.")
}, "users")

// The setting is not writable through the record API: a session alone must
// not be enough to switch the protection off. A superuser can still change it
// in the admin UI -- the way back in for someone who lost phone and codes.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("mfa_enabled", false)
  e.next()
}, "users")

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("mfa_enabled", e.record.original().getBool("mfa_enabled"))
  e.next()
}, "users")

routerAdd("GET", "/api/two-step", (e) => {
  var twoStep = require(`${__hooks}/glue/two_step.js`)
  var user = e.app.findRecordById("users", e.auth.id)
  var method = twoStep.method(user)
  var row = method === "app" ? twoStep.appRow(user.id) : null
  return e.json(200, { method: method, recovery_codes_left: row ? twoStep.recoveryHashes(row).length : 0 })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/two-step/off", (e) => {
  var user = e.app.findRecordById("users", e.auth.id)
  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }
  var row = require(`${__hooks}/glue/two_step.js`).appRow(user.id)
  e.app.runInTransaction((txApp) => {
    if (row) txApp.delete(row)
    user.set("mfa_enabled", false)
    txApp.save(user)
  })
  return e.noContent(204)
}, $apis.requireAuth("users"))

// Setting up an app asks for the password: without it, anyone holding a
// session could put their own app in place of the person's. A fresh secret
// each time; until a code confirms it, the app set up before (if any) stays
// the one sign-in asks for.
routerAdd("POST", "/api/two-step/app", (e) => {
  var totp = require(`${__hooks}/lib/totp.js`)
  var twoStep = require(`${__hooks}/glue/two_step.js`)
  var user = e.app.findRecordById("users", e.auth.id)

  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }

  var row = twoStep.appRow(user.id)
  if (!row) {
    row = new Record(e.app.findCollectionByNameOrId("user_totp"))
    row.set("user", user.id)
  }
  var secret = $security.randomStringWithAlphabet(32, totp.BASE32) // 160 bits
  row.set("pending_secret", secret)
  e.app.save(row)
  return e.json(200, { secret: secret, uri: totp.otpauthUri(secret, user.getString("email"), "Cheddar") })
}, $apis.requireAuth("users"))

// The first right code from the new app turns it on, and returns recovery
// codes for the day the phone is lost. They are shown only now.
routerAdd("POST", "/api/two-step/app/confirm", (e) => {
  var totp = require(`${__hooks}/lib/totp.js`)
  var twoStep = require(`${__hooks}/glue/two_step.js`)
  var lockout = require(`${__hooks}/glue/lockout.js`)
  var user = e.app.findRecordById("users", e.auth.id)

  var row = twoStep.appRow(user.id)
  if (!row || !row.getString("pending_secret")) throw new BadRequestError("Start again: set up your authenticator app first.")
  lockout.refuseIfLocked(row)

  var step = totp.matchStep(row.getString("pending_secret"), (e.requestInfo().body || {}).code, Date.now(), 0)
  if (step < 0) {
    lockout.strike(row, "That code is wrong. Check it's the Cheddar entry in your app, and try the next one.",
      "Too many wrong codes. Try again in 15 minutes.")
  }

  row.set("secret", row.getString("pending_secret"))
  row.set("pending_secret", "")
  row.set("last_step", step)
  row.set("attempts", 0)
  var codes = twoStep.newRecoveryCodes(row)
  e.app.runInTransaction((txApp) => {
    txApp.save(row)
    user.set("mfa_enabled", true)
    txApp.save(user)
  })
  return e.json(200, { recovery_codes: codes })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/two-step/recovery-codes", (e) => {
  var twoStep = require(`${__hooks}/glue/two_step.js`)
  var user = e.app.findRecordById("users", e.auth.id)

  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }
  if (twoStep.method(user) !== "app") throw new BadRequestError("Turn on two-step sign-in first.")

  var row = twoStep.appRow(user.id)
  var codes = twoStep.newRecoveryCodes(row)
  e.app.save(row)
  return e.json(200, { recovery_codes: codes })
}, $apis.requireAuth("users"))

// The second step. A collection auth action, answered only to Nuxt's
// /api/auth/code (the browser can't reach PocketBase). recordAuthResponse()
// checks the mfaId as PocketBase's own sign-ins do: it must be this person's
// password step, not expired, and it is used up.
routerAdd("POST", "/api/collections/users/auth-with-app-code", (e) => {
  var twoStep = require(`${__hooks}/glue/two_step.js`)
  var lockout = require(`${__hooks}/glue/lockout.js`)
  var body = e.requestInfo().body || {}

  var user = twoStep.passwordStepUser(body.mfaId)
  if (!user || twoStep.method(user) !== "app") throw new BadRequestError("Sign in with your password first.")
  var row = twoStep.appRow(user.id)
  lockout.refuseIfLocked(row)

  var kind = twoStep.acceptCode(row, body.code)
  if (!kind) {
    lockout.strike(row, "That code is wrong. Check it's the Cheddar entry in your app, or use a recovery code.",
      "Too many wrong codes. Try again in 15 minutes.")
  }
  row.set("attempts", 0)
  e.app.save(row)

  var meta = kind === "recovery" ? { recovery_codes_left: twoStep.recoveryHashes(row).length } : null
  return $apis.recordAuthResponse(e, user, "app", meta)
})
