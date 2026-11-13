/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Changing your password or email from Settings, each behind the current
// password, so a session alone (a phone left unlocked) can't take the
// account away:
//
//   POST /api/change-password        { password, newPassword } -> { token }
//   POST /api/request-email-change   { password, newEmail }    -> 204
//
// A new password ends every other session: a new tokenKey voids every token
// signed with the old one, and the answer is a fresh token for this one.
// Nuxt checks the new password against shared/passwords.ts first.
//
// Like everything else but two-step setup, sign-out and deletion, both wait
// until two-step sign-in is on (migrations/0002_require_two_step.mjs).
//
// An email change goes through PocketBase's own confirm link, sent to the new
// address (POST /api/collections/users/confirm-email-change { token,
// password }, which asks for the password again and signs every device out).
// The old address hears about it twice: when it's asked for and when it's
// done (lib/notices.js).
// ---------------------------------------------------------------------------

routerAdd("POST", "/api/change-password", (e) => {
  var body = e.requestInfo().body || {}
  var user = require(`${__hooks}/glue/credentials.js`).owner(e)
  var next = String(body.newPassword || "")
  if (!next) throw new BadRequestError("Choose a new password.")
  if (next === String(body.password)) throw new BadRequestError("The new password is the same as the old one.")

  user.setPassword(next)
  user.refreshTokenKey()
  e.app.save(user)
  // Every other device is signed out; this one keeps its session row.
  var sessions = require(`${__hooks}/glue/sessions.js`)
  var mine = sessions.current(e)
  sessions.endAll(e.app, user.id, mine ? mine.id : "")
  require(`${__hooks}/glue/events.js`).record(e.app, user.id, "password_changed", e)
  return e.json(200, { token: user.newAuthToken() })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/request-email-change", (e) => {
  var body = e.requestInfo().body || {}
  var user = require(`${__hooks}/glue/credentials.js`).owner(e)
  var newEmail = String(body.newEmail || "").trim().toLowerCase()
  if (newEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new BadRequestError("Enter a valid email address.")
  }
  if (newEmail === user.email().toLowerCase()) throw new BadRequestError("That's already your email.")
  var taken = null
  try {
    taken = e.app.findAuthRecordByEmail("users", newEmail)
  }
  catch (_) {
    // Not found: free to use.
  }
  if (taken) throw new BadRequestError("That email can't be used. Choose another.")

  $mails.sendRecordChangeEmail(e.app, user, newEmail)
  var notice = require(`${__hooks}/lib/notices.js`).emailChangeAsked(newEmail)
  require(`${__hooks}/glue/mailjet.js`).send({ to: user.email(), toName: user.getString("name"), subject: notice.subject, html: notice.html })
  return e.noContent(204)
}, $apis.requireAuth("users"))

// PocketBase's own request route would change the email on a session alone,
// without the password: the route above is the only way in.
onRecordRequestEmailChangeRequest(() => {
  throw new BadRequestError("Change your email in Settings.")
}, "users")

onRecordConfirmEmailChangeRequest((e) => {
  var oldEmail = e.record.email()
  var name = e.record.getString("name")
  e.next()
  // The confirm signs every device out: their session rows go too.
  require(`${__hooks}/glue/sessions.js`).endAll(e.app, e.record.id, "")
  require(`${__hooks}/glue/events.js`).record(e.app, e.record.id, "email_changed", e)
  // The change is made; a notice that fails to send must not undo it.
  try {
    var notice = require(`${__hooks}/lib/notices.js`).emailChanged(e.newEmail)
    require(`${__hooks}/glue/mailjet.js`).send({ to: oldEmail, toName: name, subject: notice.subject, html: notice.html })
  }
  catch (err) {
    console.log("[credentials] Could not send the email-changed notice: " + err)
  }
}, "users")

// The record API could set a password too, given the old one, but would skip
// the length and common-password check Nuxt makes before the route above.
onRecordUpdateRequest((e) => {
  var body = e.requestInfo().body || {}
  if (!e.hasSuperuserAuth() && ("password" in body || "oldPassword" in body)) {
    throw new BadRequestError("Change your password in Settings.")
  }
  e.next()
}, "users")
