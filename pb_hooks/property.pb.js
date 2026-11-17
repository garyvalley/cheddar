/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Home and car values that change at a yearly rate (shared/property.ts,
// issue #113). Every morning, each open property account with a yearly
// change and no bank behind it has its balance moved on from its last
// value to today, which also writes today's balance_history row
// (balances.pb.js). Typing a new value starts it again from there.
//
//   POST /api/property-values/run -> { moved } (superusers: the admin UI, tests)
// ---------------------------------------------------------------------------

// 10:30 UTC: past midnight everywhere in the US, so "today" is the person's today.
cronAdd("property_values", "30 10 * * *", () => {
  var moved = require(`${__hooks}/glue/property.js`).move($app, new Date().toISOString().slice(0, 10))
  if (moved) console.log("[property] moved " + moved + " values on")
})

routerAdd("POST", "/api/property-values/run", (e) => {
  var today = String((e.requestInfo().body || {}).today || new Date().toISOString().slice(0, 10))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new BadRequestError("today is YYYY-MM-DD.")
  return e.json(200, { moved: require(`${__hooks}/glue/property.js`).move(e.app, today) })
}, $apis.requireSuperuserAuth())
