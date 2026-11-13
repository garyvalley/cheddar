/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/lockout.js applied to a record: reads its tries, saves the new count
// and throws what the request answers.
// ---------------------------------------------------------------------------

var lockout = require(`${__hooks}/lib/lockout.js`)

/** 429 while five wrong tries keep the row locked. */
function refuseIfLocked(row, what) {
  var minutes = lockout.minutesLocked(row.getString("locked_until"), Date.now())
  if (minutes) throw new TooManyRequestsError(lockout.lockedMessage(minutes, what))
}

/**
 * Counts a wrong code and throws `message`, or, when this was the fifth and
 * the row is now locked, says for how long. `onLock(minutes)`, when given,
 * runs once the lock is saved (an email to the person).
 */
function strike(row, message, what, onLock) {
  var next = lockout.strike(row.getInt("attempts"), Date.now(), row.getInt("lockouts"))
  row.set("attempts", next.attempts)
  row.set("lockouts", next.lockouts)
  if (next.locked) row.set("locked_until", next.locked_until)
  $app.save(row)
  if (next.locked) {
    if (onLock) {
      try {
        onLock(next.minutes)
      }
      catch (err) {
        console.log("[lockout] notice failed: " + err)
      }
    }
    throw new TooManyRequestsError(lockout.lockedMessage(next.minutes, what))
  }
  throw new BadRequestError(message)
}

/** A right code: the next lockout is the first again. */
function clear(row) {
  row.set("attempts", 0)
  row.set("lockouts", 0)
}

module.exports = {
  refuseIfLocked: refuseIfLocked,
  strike: strike,
  clear: clear,
}
