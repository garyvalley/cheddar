/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// A bank link's transaction that a statement already brought in. The ids
// never match ("plaid:" against "fitid:" or "csv:"), so a synced transaction
// is the same as an imported one when the amount is equal to the cent and the
// dates are at most MATCH_DAYS apart. The sync then takes the imported row
// over instead of adding a second one (pb_hooks/glue/plaid.js).
//
// shared/overlap.ts does the same for an import; a unit test keeps the two
// equal. Pure: plain values in and out, so Node can run it.
// ---------------------------------------------------------------------------

var MATCH_DAYS = 4

var DAY_MS = 24 * 60 * 60 * 1000

function dayOf(ymd) {
  return Date.parse(ymd + "T00:00:00Z")
}

/** Whole days between two YYYY-MM-DD dates, either way round. */
function daysApart(a, b) {
  return Math.round(Math.abs(dayOf(a) - dayOf(b)) / DAY_MS)
}

/** The dates a row from `first` to `last` could match: MATCH_DAYS either side. */
function around(first, last) {
  var at = function (ymd, days) { return new Date(dayOf(ymd) + days * DAY_MS).toISOString().slice(0, 10) }
  return { from: at(first, -MATCH_DAYS), to: at(last || first, MATCH_DAYS) }
}

/**
 * The index of the candidate ({ posted, amount_cents }) that `row` is the
 * same as, the nearest in date (the earlier on a tie), or -1. Skips the
 * indexes `taken` maps to true.
 */
function nearest(row, candidates, taken) {
  var best = -1
  var bestDays = MATCH_DAYS + 1
  candidates.forEach(function (c, i) {
    if ((taken && taken[i]) || c.amount_cents !== row.amount_cents) return
    var days = daysApart(row.posted, c.posted)
    if (days < bestDays || (days === bestDays && best !== -1 && c.posted < candidates[best].posted)) {
      best = i
      bestDays = days
    }
  })
  return best
}

module.exports = {
  MATCH_DAYS: MATCH_DAYS,
  daysApart: daysApart,
  around: around,
  nearest: nearest,
}
