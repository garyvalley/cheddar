/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/sessions.js applied to the `sessions` rows (migrations/0025). Required
// inside a handler body, like every glue module.
// ---------------------------------------------------------------------------

var rules = require(`${__hooks}/lib/sessions.js`)


function hash(sid) {
  return $security.sha256(sid)
}

/**
 * A new row for `user` signing in now; returns its id, given once to Nuxt.
 * `headers` is e.requestInfo().headers (lower case, "_" for "-").
 */
function start(app, user, headers) {
  var sid = $security.randomString(40)
  var row = new Record(app.findCollectionByNameOrId("sessions"))
  var now = Date.now()
  row.set("user", user.id)
  row.set("sid_hash", hash(sid))
  row.set("device", rules.deviceLabel(headers.x_cheddar_device).slice(0, 60))
  row.set("place", rules.place(headers.x_cheddar_place))
  row.set("signed_in", now)
  row.set("verified", now)
  row.set("last_used", now)
  app.save(row)
  return sid
}

/** The row behind a session id for `userId`, or null. */
function find(app, userId, sid) {
  if (!rules.isSessionId(sid)) return null
  try {
    var row = app.findFirstRecordByFilter("sessions", "sid_hash = {:h}", { h: hash(sid) })
    return row.getString("user") === userId ? row : null
  }
  catch (_) {
    return null
  }
}

/** The caller's own row, from the request's header, or null. */
function current(e) {
  if (!e.auth) return null
  return find(e.app, e.auth.id, e.requestInfo().headers.x_cheddar_session)
}

/** Deletes every row `userId` has, but the one `keepId` names (a row id). */
function endAll(app, userId, keepId) {
  app.findRecordsByFilter("sessions", "user = {:u}", "", 0, 0, { u: userId }).forEach(function (row) {
    if (row.id !== keepId) app.delete(row)
  })
}

/** The person's devices, newest use first, for Settings. Never the id or its hash. */
function list(app, userId, currentId) {
  return app.findRecordsByFilter("sessions", "user = {:u}", "-last_used", 0, 0, { u: userId }).map(function (row) {
    return {
      id: row.id,
      device: row.getString("device"),
      place: row.getString("place"),
      signed_in: row.getInt("signed_in"),
      last_used: row.getInt("last_used"),
      current: row.id === currentId,
    }
  })
}

/** 403 unless the caller typed their password in the last 15 minutes (POST /api/sessions/confirm). */
function requireFreshPassword(e) {
  var row = current(e)
  if (!row || rules.needsPassword(row.getInt("verified"), Date.now())) {
    throw new ForbiddenError("Enter your password to continue.", { password: "required" })
  }
}

module.exports = {
  start: start,
  find: find,
  current: current,
  endAll: endAll,
  list: list,
  requireFreshPassword: requireFreshPassword,
}
