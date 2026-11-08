/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Five wrong tries, then 15 minutes locked: for two-step sign-in's
// authenticator codes. Plain values in and out, so Node can
// run it; pb_hooks/glue/lockout.js reads and saves the row (`attempts`, a
// number, and `locked_until`, a PocketBase date).
// ---------------------------------------------------------------------------

var dates = require(`${__hooks}/lib/dates.js`)

var LOCK_MS = 15 * 60 * 1000
var TRIES = 5

/** Whole minutes left while `lockedUntil` (a PocketBase date, or "") is after `now`; 0 once it isn't. */
function minutesLocked(lockedUntil, now) {
  if (!lockedUntil || lockedUntil <= dates.toPb(now)) return 0
  return Math.ceil((dates.parsePb(lockedUntil).getTime() - now) / 60000)
}

/** What a locked row says. */
function lockedMessage(minutes) {
  return "Too many wrong tries. Try again in " + minutes + (minutes === 1 ? " minute." : " minutes.")
}

/**
 * One more wrong try on a row that has had `attempts`: the fifth locks it
 * from `now` and starts the count again. Returns what to store.
 */
function strike(attempts, now) {
  var next = attempts + 1
  if (next >= TRIES) return { locked: true, attempts: 0, locked_until: dates.toPb(now + LOCK_MS) }
  return { locked: false, attempts: next }
}

module.exports = {
  minutesLocked: minutesLocked,
  lockedMessage: lockedMessage,
  strike: strike,
}
