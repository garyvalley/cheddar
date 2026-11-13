/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Dates as PocketBase stores them, "YYYY-MM-DD HH:MM:SS.sssZ" in UTC, and the
// day arithmetic the hooks do on them. Date-only fields (due dates, warranty
// expiries) are stored as UTC midnight, so days are counted in UTC.
//
// Hooks and other libs require() this; tests/load-hook-module.mjs resolves
// that for the unit tests. Pure: no PocketBase globals, no clock of its own.
// ---------------------------------------------------------------------------

var DAY_MS = 24 * 60 * 60 * 1000

/** A PocketBase (or ISO) date string as a Date, or null for an empty or unreadable one. */
function parsePb(value) {
  if (!value) return null
  var d = new Date(String(value).replace(" ", "T"))
  return isNaN(d.getTime()) ? null : d
}

/** A Date or epoch milliseconds in PocketBase's format. */
function toPb(date) {
  return new Date(date).toISOString().replace("T", " ")
}

/** UTC midnight of the date's UTC day, in PocketBase's format: how a date-only field holds that day. */
function toPbDay(date) {
  return new Date(date).toISOString().slice(0, 10) + " 00:00:00.000Z"
}

/** `n` days after a Date or epoch milliseconds (before, for negative `n`), as a Date. */
function addDays(date, n) {
  return new Date(new Date(date).getTime() + n * DAY_MS)
}

/** Whole calendar days (UTC) from `a`'s date to `b`'s; negative when `b` is earlier. */
function daysBetween(a, b) {
  var from = new Date(a)
  var to = new Date(b)
  var fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  var toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.round((toDay - fromDay) / DAY_MS)
}

/**
 * The person's own "today" (YYYY-MM-DD), as Nuxt worked it out in their time
 * zone (shared/time-zone.ts) -- the hooks have no time zone data -- when it's
 * a real date within a day of `now`'s UTC one, as every zone's is; otherwise
 * the UTC day.
 */
function personToday(value, now) {
  var utc = new Date(now).toISOString().slice(0, 10)
  var s = String(value || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return utc
  var d = new Date(s + "T00:00:00Z")
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return utc
  return Math.abs(daysBetween(utc + "T00:00:00Z", d)) <= 1 ? s : utc
}

module.exports = {
  personToday: personToday,
  parsePb: parsePb,
  toPb: toPb,
  toPbDay: toPbDay,
  addDays: addDays,
  daysBetween: daysBetween,
}
