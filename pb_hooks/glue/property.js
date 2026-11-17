/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Moves property values on by their yearly change (pb_hooks/property.pb.js,
// shared/property.ts). Required inside a handler body, not at file scope
// (glue/bank_links.js says why).
// ---------------------------------------------------------------------------

/** Each open, unlinked property account with a yearly change, moved on to `today`. Answers how many moved. */
function move(app, today) {
  var lib = require(`${__hooks}/lib/gen/property.js`)
  var rows = app.findRecordsByFilter(
    "accounts",
    "kind = 'property' && yearly_change_bp != 0 && link = '' && balance_date != '' && balance_date < {:today} && (closed_on = '' || closed_on > {:today})",
    "",
    0,
    0,
    { today: today },
  )
  var moved = 0
  rows.forEach(function (a) {
    try {
      var days = lib.daysBetween(a.getString("balance_date"), today)
      a.set("balance_cents", lib.valueAfter(a.getInt("balance_cents"), a.getInt("yearly_change_bp"), days))
      a.set("balance_date", today)
      app.save(a)
      moved++
    }
    catch (err) {
      console.log("[property] couldn't move " + a.id + " on: " + err)
    }
  })
  return moved
}

module.exports = { move: move }
