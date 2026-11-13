/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Five wrong tries, then locked: 15 minutes the first time, doubling with
// each lockout after it (30 minutes, an hour, ...) up to a day, until a
// right code resets it. For two-step sign-in's authenticator codes. Plain
// values in and out, so Node can run it; pb_hooks/glue/lockout.js reads and
// saves the row (`attempts`, `lockouts`, numbers, and `locked_until`, a
// PocketBase date).
// ---------------------------------------------------------------------------

var dates = require(`${__hooks}/lib/dates.js`)

var LOCK_MS = 15 * 60 * 1000
var MAX_LOCK_MS = 24 * 60 * 60 * 1000
var TRIES = 5

/** How long the lockout after `lockouts` earlier ones lasts: 15 minutes, doubling, at most a day. */
function lockMs(lockouts) {
  return Math.min(MAX_LOCK_MS, LOCK_MS * Math.pow(2, Math.max(0, Math.min(lockouts || 0, 10))))
}

/** Whole minutes left while `lockedUntil` (a PocketBase date, or "") is after `now`; 0 once it isn't. */
function minutesLocked(lockedUntil, now) {
  if (!lockedUntil || lockedUntil <= dates.toPb(now)) return 0
  return Math.ceil((dates.parsePb(lockedUntil).getTime() - now) / 60000)
}

/** "15 minutes", "1 hour", "2 hours", "1 day". */
function duration(minutes) {
  if (minutes < 60 || minutes % 60) return minutes + (minutes === 1 ? " minute" : " minutes")
  var hours = minutes / 60
  if (hours === 24) return "1 day"
  return hours + (hours === 1 ? " hour" : " hours")
}

/** What a locked row says. `what` is the wrong things tried ("tries", "codes"). */
function lockedMessage(minutes, what) {
  return "Too many wrong " + (what || "tries") + ". Try again in " + duration(minutes) + "."
}

/**
 * One more wrong try on a row that has had `attempts` since its last
 * lockout, and `lockouts` lockouts since its last right code: the fifth
 * locks it from `now` for lockMs(lockouts) and starts the count of tries
 * again. Returns what to store.
 */
function strike(attempts, now, lockouts) {
  var next = attempts + 1
  var before = lockouts || 0
  if (next >= TRIES) {
    var ms = lockMs(before)
    return { locked: true, attempts: 0, lockouts: before + 1, minutes: ms / 60000, locked_until: dates.toPb(now + ms) }
  }
  return { locked: false, attempts: next, lockouts: before }
}

module.exports = {
  TRIES: TRIES,
  lockMs: lockMs,
  duration: duration,
  minutesLocked: minutesLocked,
  lockedMessage: lockedMessage,
  strike: strike,
}
