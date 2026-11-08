/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/lockout.js applied to a record: reads its tries, saves the new count
// and throws what the request answers.
// ---------------------------------------------------------------------------

var lockout = require(`${__hooks}/lib/lockout.js`)

/** 429 while five wrong tries keep the row locked. */
function refuseIfLocked(row) {
  var minutes = lockout.minutesLocked(row.getString("locked_until"), Date.now())
  if (minutes) throw new TooManyRequestsError(lockout.lockedMessage(minutes))
}

/**
 * Counts a wrong password or code and throws `message`, or `lockedMessage`
 * when this was the fifth and the row is now locked.
 */
function strike(row, message, lockedMessage) {
  var next = lockout.strike(row.getInt("attempts"), Date.now())
  row.set("attempts", next.attempts)
  if (next.locked) row.set("locked_until", next.locked_until)
  $app.save(row)
  if (next.locked) throw new TooManyRequestsError(lockedMessage)
  throw new BadRequestError(message)
}

module.exports = {
  refuseIfLocked: refuseIfLocked,
  strike: strike,
}
