/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Who may make an account on this Cheddar (pb_hooks/signup.pb.js checks it as
// each account is made). Pure: the environment comes in as a getenv function.
//
//   SIGNUP        open (anyone; the default), invite (only SIGNUP_ALLOW) or closed
//   SIGNUP_ALLOW  invite's list: addresses and whole domains, comma or space
//                 separated, such as "me@x.com, @family.org"
//
// A word SIGNUP doesn't know counts as invite: a typo keeps strangers out but
// still lets the people on the list in.
// ---------------------------------------------------------------------------

var MODES = ["open", "invite", "closed"]

function config(getenv) {
  var raw = String(getenv("SIGNUP") || "").trim().toLowerCase()
  var mode = !raw ? "open" : MODES.indexOf(raw) >= 0 ? raw : "invite"
  var allow = String(getenv("SIGNUP_ALLOW") || "")
    .split(/[\s,;]+/)
    .map(function (s) { return s.trim().toLowerCase() })
    .filter(function (s) { return /^[^@\s]*@[^@\s]+$/.test(s) })
  return { mode: mode, allow: allow }
}

/** Whether `email` may make an account: the whole address, or "@domain" for anyone there. */
function allows(cfg, email) {
  if (cfg.mode === "open") return true
  if (cfg.mode === "closed") return false
  var e = String(email || "").trim().toLowerCase()
  var at = e.lastIndexOf("@")
  if (at < 1) return false
  var domain = e.slice(at)
  return cfg.allow.some(function (a) { return a === e || (a.charAt(0) === "@" && a === domain) })
}

/** What the sign-up form says when an address is turned away. */
function refusal(cfg) {
  return cfg.mode === "closed"
    ? "This Cheddar isn't taking new accounts."
    : "This Cheddar is invite-only, and that email isn't on its list. Ask whoever runs it to add you."
}

module.exports = {
  MODES: MODES,
  config: config,
  allows: allows,
  refusal: refusal,
}
