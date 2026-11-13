/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Signed-in devices (lib/sessions.js says why; rows in migrations/0025).
//
// A full sign-in (password, then the code once two-step is on) makes a
// `sessions` row, and its id comes back once, in the auth answer's
// meta.session. Every request with a person's token must then carry that id
// in X-Cheddar-Session, or it is refused as signed out: Nuxt keeps the id in
// its own httpOnly cookie and sends it. A token copied without the id is no
// use, and deleting the row ends the device even while its token lasts.
//
//   GET  /api/sessions              -> { sessions: [{ id, device, place, signed_in, last_used, current }] }
//   POST /api/sessions/end          -> 204; signs this device out
//   POST /api/sessions/{id}/end     -> 204; signs that device out
//   POST /api/sessions/confirm      { password } -> 204; the password counts as fresh for 15 minutes
//   POST /api/sign-out-everywhere   -> 204; every token and every row ends
//
// A session needs a full sign-in again 30 days after its last one, however
// often it is renewed. Rows past that, or unused longer than a token lasts,
// are deleted every night.
// ---------------------------------------------------------------------------

// Every full sign-in makes a row. A password alone is a full sign-in only for
// an account without two-step sign-in yet (it can only set it up, sign out or
// delete itself: migrations/0002); with two-step on, the password step ends
// in an mfaId, and the row is made with the code. Renewing ("") makes none.
onRecordAuthRequest((e) => {
  var full = e.authMethod === "app" || (e.authMethod === "password" && !e.record.getBool("mfa_enabled"))
  if (full) {
    var sid = require(`${__hooks}/glue/sessions.js`).start(e.app, e.record, e.requestInfo().headers)
    require(`${__hooks}/glue/events.js`).record(e.app, e.record.id, "sign_in", e)
    var meta = {}
    if (e.meta) for (var k in e.meta) meta[k] = e.meta[k]
    meta.session = sid
    e.meta = meta
  }
  e.next()
}, "users")

// A person's token counts only beside its live session row.
routerUse((e) => {
  if (e.auth && e.auth.collection().name === "users") {
    var rules = require(`${__hooks}/lib/sessions.js`)
    var row = require(`${__hooks}/glue/sessions.js`).current(e)
    var now = Date.now()
    if (!row || rules.isExpired(row.getInt("signed_in"), now)) {
      if (row) e.app.delete(row)
      throw new UnauthorizedError("Sign in again.")
    }
    if (rules.shouldTouch(row.getInt("last_used"), now)) {
      row.set("last_used", now)
      e.app.save(row)
    }
  }
  return e.next()
})

routerAdd("GET", "/api/sessions", (e) => {
  var sessions = require(`${__hooks}/glue/sessions.js`)
  var row = sessions.current(e)
  return e.json(200, { sessions: sessions.list(e.app, e.auth.id, row ? row.id : "") })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sessions/end", (e) => {
  var row = require(`${__hooks}/glue/sessions.js`).current(e)
  if (row) e.app.delete(row)
  return e.noContent(204)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sessions/{id}/end", (e) => {
  try {
    var row = e.app.findRecordById("sessions", e.request.pathValue("id"))
    if (row.getString("user") === e.auth.id) e.app.delete(row)
  }
  catch (_) {
    // Gone already, or someone else's: the same answer, so it says nothing.
  }
  return e.noContent(204)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sessions/confirm", (e) => {
  var user = e.app.findRecordById("users", e.auth.id)
  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }
  var row = require(`${__hooks}/glue/sessions.js`).current(e)
  row.set("verified", Date.now())
  e.app.save(row)
  return e.noContent(204)
}, $apis.requireAuth("users"))

// Sign out everywhere. Every token PocketBase issues is signed with the
// account's tokenKey, so a new tokenKey ends all of them at once -- the
// remedy for a lost phone or a shared computer -- and the rows go too.
routerAdd("POST", "/api/sign-out-everywhere", (e) => {
  var user = e.app.findRecordById("users", e.auth.id)
  require(`${__hooks}/glue/events.js`).record(e.app, user.id, "signed_out_everywhere", e)
  user.refreshTokenKey()
  e.app.save(user)
  require(`${__hooks}/glue/sessions.js`).endAll(e.app, user.id, "")
  return e.noContent(204)
}, $apis.requireAuth("users"))

cronAdd("sessions_cleanup", "23 5 * * *", () => {
  var rules = require(`${__hooks}/lib/sessions.js`)
  var now = Date.now()
  $app.findRecordsByFilter("sessions", "signed_in < {:old} || last_used < {:idle}", "", 0, 0,
    { old: now - rules.MAX_AGE_MS, idle: now - 3 * 24 * 60 * 60 * 1000 }).forEach(function (row) {
    if (rules.isStale(row.getInt("signed_in"), row.getInt("last_used"), now)) $app.delete(row)
  })
})
