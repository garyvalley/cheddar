/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Writes a `security_events` row (migrations/0026; shared/activity.ts lists
// the kinds). Best effort: what it records has already happened, so a row
// that fails to save never undoes it. Required inside a handler body, like
// every glue module.
// ---------------------------------------------------------------------------

/**
 * Records `kind` for `userId`. With `e`, the device and place come from the
 * sign-in's headers, or else from the caller's session row.
 */
function record(app, userId, kind, e, detail) {
  try {
    var rules = require(`${__hooks}/lib/sessions.js`)
    var device = ""
    var place = ""
    if (e) {
      var h = e.requestInfo().headers || {}
      if (h.x_cheddar_device) device = rules.deviceLabel(h.x_cheddar_device)
      place = rules.place(h.x_cheddar_place)
      if (!device && e.auth) {
        var row = require(`${__hooks}/glue/sessions.js`).current(e)
        if (row) {
          device = row.getString("device")
          place = place || row.getString("place")
        }
      }
    }
    var ev = new Record(app.findCollectionByNameOrId("security_events"))
    ev.set("user", userId)
    ev.set("kind", kind)
    ev.set("device", String(device).slice(0, 60))
    ev.set("place", place)
    ev.set("detail", String(detail || "").slice(0, 120))
    app.save(ev)
  }
  catch (err) {
    console.log("[events] could not record " + kind + ": " + err)
  }
}

module.exports = { record: record }
