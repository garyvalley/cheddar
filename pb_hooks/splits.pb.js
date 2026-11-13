/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Splitting a transaction across categories (shared/splits.ts). The parts
// are the transaction's `splits`, which Nuxt's PATCH /api/transactions/:id
// writes as the person. Whatever writes them through the record API, they're
// checked here (lib/splits.js): a new transaction starts unsplit, and a
// change to the parts must add up to the amount, in the person's own
// categories. A bank sync and a statement import never touch them, so a
// split outlasts every sync; a change to the amount afterwards leaves it to
// be fixed, and the left-over counts in the transaction's own category.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("splits", null)
  e.next()
}, "transactions")

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var now = e.record.getString("splits")
    if (now !== e.record.original().getString("splits")) {
      var lib = require(`${__hooks}/lib/splits.js`)
      var glue = require(`${__hooks}/glue/categories.js`)
      var owner = e.record.original().getString("owner")
      var value
      try {
        value = JSON.parse(now)
      }
      catch (_) {
        throw new BadRequestError("A split is a list of parts.")
      }
      var r = lib.check(value, e.record.getInt("amount_cents"), function (id) { return glue.usable(e.app, owner, id) })
      if (r.problem) throw new BadRequestError(r.problem)
      e.record.set("splits", r.parts)
    }
  }
  e.next()
}, "transactions")
