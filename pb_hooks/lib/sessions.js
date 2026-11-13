/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Signed-in devices (issue #41): each full sign-in (password and code) is a
// `sessions` row, and a token is honoured only beside its row's id, which
// Nuxt keeps in a second httpOnly cookie and sends as X-Cheddar-Session
// (pb_hooks/sessions.pb.js). So signing out ends that device for real, any
// one device can be signed out from Settings, and a session can't be renewed
// forever: 30 days after its sign-in, it needs the password and code again.
// Linking or unlinking a bank also wants the password once the last one
// typed is more than 15 minutes old.
//
// Plain values in and out, so Node can run it; pb_hooks/glue/sessions.js
// reads and saves the rows.
// ---------------------------------------------------------------------------

var DAY_MS = 24 * 60 * 60 * 1000
var MAX_AGE_MS = 30 * DAY_MS
/** How long a typed password counts for the steps that want a fresh one. */
var FRESH_MS = 15 * 60 * 1000
/** last_used is saved at most this often, so reading a page doesn't write every time. */
var TOUCH_MS = 5 * 60 * 1000
/** A row unused for this long has no token left that works (they last 3 days). */
var IDLE_MS = 3 * DAY_MS

/** Whether a session that signed in at `signedIn` (ms) is past its 30 days at `now`. */
function isExpired(signedIn, now) {
  return !(signedIn > 0) || now - signedIn >= MAX_AGE_MS
}

/** Whether the password last typed at `verified` (ms) is too old for linking or unlinking a bank. */
function needsPassword(verified, now) {
  return !(verified > 0) || now - verified >= FRESH_MS
}

/** Whether last_used, last saved at `lastUsed` (ms), is worth saving again. */
function shouldTouch(lastUsed, now) {
  return !(lastUsed > 0) || now - lastUsed >= TOUCH_MS
}

/** Whether a row can be deleted: past its 30 days, or unused for longer than a token lasts. */
function isStale(signedIn, lastUsed, now) {
  return isExpired(signedIn, now) || now - Math.max(signedIn || 0, lastUsed || 0) >= IDLE_MS
}

/**
 * "Safari on iPhone", "Chrome on Windows", ... from a User-Agent, for the
 * devices list. Rough on purpose: it only has to help someone tell their own
 * devices apart. "A browser" when nothing matches.
 */
function deviceLabel(userAgent) {
  var ua = String(userAgent || "")
  var os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
      : /Android/.test(ua) ? "Android"
        : /CrOS/.test(ua) ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(ua) ? "Mac"
            : /Windows/.test(ua) ? "Windows"
              : /Linux/.test(ua) ? "Linux" : ""
  var browser = /Edg\//.test(ua) ? "Edge"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
      : /OPR\//.test(ua) ? "Opera"
        : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
          : /Safari\//.test(ua) ? "Safari" : ""
  if (browser && os) return browser + " on " + os
  return browser || os || "A browser"
}

/** A two-letter country from CF-IPCountry, or "" (Cloudflare's XX and T1 say it doesn't know). */
function place(country) {
  var c = String(country || "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : ""
}

/** Whether a session id from a header is shaped like one this makes (40 letters and digits). */
function isSessionId(text) {
  return /^[a-zA-Z0-9]{40}$/.test(String(text || ""))
}

module.exports = {
  MAX_AGE_MS: MAX_AGE_MS,
  FRESH_MS: FRESH_MS,
  isExpired: isExpired,
  needsPassword: needsPassword,
  shouldTouch: shouldTouch,
  isStale: isStale,
  deviceLabel: deviceLabel,
  place: place,
  isSessionId: isSessionId,
}
