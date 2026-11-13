/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// A transaction split across categories (shared/splits.ts says how splits
// work). This checks the parts as they're saved through the record API, so
// whatever writes them, a stored split is always one that added up when it
// was made: two to MAX_PARTS parts, each in its own category, each going the
// same way as the transaction, together exactly its amount.
//
// shared/splits.ts reads and checks them the same way; a unit test keeps the
// two equal. Pure: plain values in and out, so Node can run it.
// ---------------------------------------------------------------------------

var MIN_PARTS = 2
var MAX_PARTS = 10

function isCents(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v !== 0
}

/**
 * The parts to store for `value` on a transaction of `amount` cents, or a
 * problem: { parts } (null when it isn't split) or { problem }. `usable`
 * says whether a category id is the person's to choose.
 */
function check(value, amount, usable) {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return { parts: null }
  if (!Array.isArray(value)) return { problem: "A split is a list of parts." }
  if (!amount) return { problem: "A transaction of $0.00 can't be split." }
  if (value.length < MIN_PARTS || value.length > MAX_PARTS) return { problem: "A split has " + MIN_PARTS + " to " + MAX_PARTS + " parts." }
  var seen = {}
  var total = 0
  var parts = []
  for (var i = 0; i < value.length; i++) {
    var p = value[i]
    if (!p || typeof p !== "object") return { problem: "A split is a list of parts." }
    var category = p.category
    if (typeof category !== "string" || !category || category.length > 20 || !usable(category)) return { problem: "Choose a category for each part." }
    if (seen[category]) return { problem: "Each part needs a category of its own." }
    seen[category] = true
    if (!isCents(p.amount_cents) || (p.amount_cents < 0) !== (amount < 0)) return { problem: "Each part goes the same way as the whole." }
    total += p.amount_cents
    parts.push({ category: category, amount_cents: p.amount_cents })
  }
  if (total !== amount) return { problem: "The parts must add up to the whole." }
  return { parts: parts }
}

/**
 * What a split's parts in `from` become when that category goes: they move
 * to `to`, joining a part already there. Answers null when fewer than two
 * parts are left, as the split then says nothing the category doesn't.
 */
function moveParts(parts, from, to) {
  var out = []
  var at = {}
  ;(parts || []).forEach(function (p) {
    var category = p.category === from ? to : p.category
    if (at[category] !== undefined) out[at[category]].amount_cents += p.amount_cents
    else {
      at[category] = out.length
      out.push({ category: category, amount_cents: p.amount_cents })
    }
  })
  return out.length >= MIN_PARTS ? out : null
}

module.exports = { MIN_PARTS: MIN_PARTS, MAX_PARTS: MAX_PARTS, check: check, moveParts: moveParts }
