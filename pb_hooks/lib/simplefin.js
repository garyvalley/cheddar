/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// SimpleFIN (https://www.simplefin.org/protocol.html): linking a bank or card
// account so its balances and transactions arrive without a file. Plain values
// in and out, so Node can run it; pb_hooks/glue/simplefin.js sends the
// requests and writes the records.
//
// How linking works:
//   1. The person makes a setup token at their SimpleFIN server (SimpleFIN
//      Bridge, https://beta-bridge.simplefin.org) and pastes it into Cheddar.
//   2. The token is a base64 claim URL. One POST to it answers an access URL,
//      https://user:pass@host/path, and the token is spent.
//   3. GET <access URL>/accounts answers every linked account with its
//      balance and transactions. Read-only: SimpleFIN can't move money.
// ---------------------------------------------------------------------------

/** Where a setup token may point. Anything else is refused, so a token can't make PocketBase call an address of the sender's choosing. */
var DEFAULT_ORIGINS = ["https://beta-bridge.simplefin.org", "https://bridge.simplefin.org"]

/** How far back the first sync reaches, and how far each later one looks back again (a pending charge posts days later). */
var FIRST_SYNC_DAYS = 90
var OVERLAP_DAYS = 10
var DAY_S = 24 * 60 * 60

/** A manual sync this soon after the last one answers the last one's result: SimpleFIN Bridge refreshes about once a day and limits requests. */
var MIN_SYNC_GAP_MS = 10 * 60 * 1000

/** Transaction and account ids carry this prefix, so they can never equal a file import's ("fitid:", "csv:"). */
var PREFIX = "sfin:"

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/** Base64 (standard or URL-safe, padding optional) to a string of bytes, or null if it isn't base64. The Goja runtime has no atob. */
function base64Decode(input) {
  var s = String(input || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "")
  if (!s || /[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) return null
  var out = ""
  var bits = 0
  var value = 0
  for (var i = 0; i < s.length; i++) {
    value = (value << 6) | B64.indexOf(s[i])
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((value >> bits) & 0xff)
    }
  }
  return out
}

/** Base64 of a string of bytes, for the Authorization header. */
function base64Encode(str) {
  var result = ""
  for (var i = 0; i < str.length; i += 3) {
    var a = str.charCodeAt(i)
    var b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0
    var c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0
    result += B64[a >> 2]
    result += B64[((a & 3) << 4) | (b >> 4)]
    result += i + 1 < str.length ? B64[((b & 15) << 2) | (c >> 6)] : "="
    result += i + 2 < str.length ? B64[c & 63] : "="
  }
  return result
}

/** Bank linking's settings, from `getenv` (an environment reader such as $os.getenv). */
function config(getenv) {
  var origins = String(getenv("SIMPLEFIN_ALLOWED_ORIGINS") || "")
    .split(",").map(function (o) { return o.trim().replace(/\/+$/, "").toLowerCase() }).filter(Boolean)
  return {
    // 32 characters: what $security.encrypt takes for AES-256. Without it,
    // linking is off, because an access URL is never stored in the clear.
    key: String(getenv("BANK_LINK_KEY") || ""),
    origins: origins.length ? origins : DEFAULT_ORIGINS.slice(),
  }
}

function isEnabled(cfg) {
  return cfg.key.length === 32
}

/** A URL's parts, or null. No userinfo unless `withCredentials`; no fragment. */
function parseUrl(url, withCredentials) {
  var m = /^(https?):\/\/(?:([^:@/?#]+):([^@/?#]+)@)?([A-Za-z0-9.-]+(?::\d{1,5})?)(\/[^?#]*)?$/.exec(String(url || ""))
  if (!m) return null
  if (!!m[2] !== !!withCredentials) return null
  return {
    origin: (m[1] + "://" + m[4]).toLowerCase(),
    user: m[2] ? decodeURIComponent(m[2]) : "",
    pass: m[3] ? decodeURIComponent(m[3]) : "",
    path: (m[5] || "").replace(/\/+$/, ""),
  }
}

/**
 * The claim URL inside a setup token, or { problem } saying why the token
 * can't be used. The URL must be on an allowed origin.
 */
function claimUrl(token, cfg) {
  var decoded = base64Decode(token)
  if (!decoded) return { problem: "That isn't a SimpleFIN setup token. Copy the whole token from SimpleFIN and paste it here." }
  var url = decoded.trim()
  var parts = parseUrl(url, false)
  if (!parts) return { problem: "That isn't a SimpleFIN setup token. Copy the whole token from SimpleFIN and paste it here." }
  if (cfg.origins.indexOf(parts.origin) === -1) return { problem: "That token is for a SimpleFIN server Cheddar doesn't use (" + parts.origin + ")." }
  return { url: url }
}

/** The claim request, as $http.send takes it. */
function claimRequest(url) {
  return { method: "POST", url: url, headers: { "Content-Length": "0" }, body: "", timeout: 30 }
}

/** The access URL a claim answered, checked like a setup token's; or { problem }. */
function accessFromClaim(statusCode, body, cfg) {
  if (statusCode === 403) {
    return { problem: "SimpleFIN says that token was already used. If you didn't use it, someone else may have: make a new one and revoke the old in SimpleFIN." }
  }
  if (statusCode < 200 || statusCode >= 300) return { problem: "SimpleFIN didn't accept the token (status " + statusCode + "). Try again, or make a new token." }
  var url = String(body || "").trim()
  var parts = parseUrl(url, true)
  if (!parts || cfg.origins.indexOf(parts.origin) === -1) return { problem: "SimpleFIN answered with something Cheddar can't use. Make a new token and try again." }
  return { access: url }
}

/** The /accounts request for an access URL, from `startS` (epoch seconds) on, with pending transactions. */
function accountsRequest(access, startS) {
  var p = parseUrl(access, true)
  return {
    method: "GET",
    url: p.origin + p.path + "/accounts?version=2&pending=1&start-date=" + Math.floor(startS),
    headers: { "Authorization": "Basic " + base64Encode(p.user + ":" + p.pass), "Accept": "application/json" },
    timeout: 60,
  }
}

/** Where a sync's window starts (epoch seconds): 90 days back the first time, then the last sync less 10 days, never past 90. */
function windowStart(lastSyncedMs, nowMs) {
  var now = Math.floor(nowMs / 1000)
  var earliest = now - FIRST_SYNC_DAYS * DAY_S
  if (!lastSyncedMs) return earliest
  return Math.max(earliest, Math.floor(lastSyncedMs / 1000) - OVERLAP_DAYS * DAY_S)
}

/** A decimal string such as "-1234.5" as whole cents, rounding half away from zero; null if it isn't a number. No floats, so nothing drifts. */
function toCents(value) {
  var m = /^\s*([+-])?(\d*)(?:\.(\d*))?\s*$/.exec(String(value === undefined || value === null ? "" : value))
  if (!m || (!m[2] && !m[3])) return null
  var whole = m[2] || "0"
  var frac = (m[3] || "") + "000"
  var cents = Number(whole) * 100 + Number(frac.slice(0, 2))
  if (Number(frac[2]) >= 5) cents += 1
  if (!isFinite(cents)) return null
  return m[1] === "-" && cents !== 0 ? -cents : cents
}

/** Epoch seconds as YYYY-MM-DD in UTC, or "" for none. */
function day(epochS) {
  var n = Number(epochS)
  if (!n || !isFinite(n)) return ""
  return new Date(n * 1000).toISOString().slice(0, 10)
}

/** A message from SimpleFIN, safe to store and show: one line, no control characters, 300 characters at most. */
function clean(text) {
  // eslint-disable-next-line no-control-regex
  return String(text === undefined || text === null ? "" : text).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)
}

/** A first guess at an account's kind from its name; the person can change it. */
function guessKind(name) {
  var n = String(name || "").toLowerCase()
  if (/\b(401\s?k|403\s?b|457|ira|roth|retire|pension|tsp|hsa)\b/.test(n)) return "retirement"
  if (/\b(credit|card|visa|mastercard|amex|american express|discover|sapphire|freedom)\b/.test(n)) return "credit_card"
  if (/\b(mortgage|loan|heloc|line of credit|auto)\b/.test(n)) return "loan"
  if (/\b(saving|savings|money market|cd)\b/.test(n)) return "savings"
  if (/\b(checking|chequing|spending|debit)\b/.test(n)) return "checking"
  if (/\b(brokerage|invest|investment|individual|joint|trading|stock)\b/.test(n)) return "brokerage"
  return "other"
}

/** The digits an account name often ends with ("Checking ...1234"), or "". */
function last4(name) {
  var m = /(\d{4})\D*$/.exec(String(name || ""))
  return m ? m[1] : ""
}

/**
 * An /accounts answer as plain rows. Takes protocol 2 (`connections`,
 * `errlist`) and 1 (`org`, `errors`).
 *
 *   { errors: [message], accounts: [{ external_id, name, institution, kind, last4, currency,
 *       balance_cents, balance_date, transactions: [{ external_id, posted, amount_cents,
 *       description, payee, pending }] }] }
 */
function parseAccountSet(json) {
  var set = json && typeof json === "object" ? json : {}
  var errors = []
  ;(Array.isArray(set.errlist) ? set.errlist : []).forEach(function (e) {
    if (e && e.msg) errors.push(clean(e.msg))
  })
  ;(Array.isArray(set.errors) ? set.errors : []).forEach(function (e) {
    var m = clean(typeof e === "string" ? e : e && e.msg)
    if (m && errors.indexOf(m) === -1) errors.push(m)
  })

  var institutions = {}
  ;(Array.isArray(set.connections) ? set.connections : []).forEach(function (c) {
    if (c && c.conn_id) institutions[c.conn_id] = clean(c.name).slice(0, 100)
  })

  var accounts = []
  ;(Array.isArray(set.accounts) ? set.accounts : []).forEach(function (a) {
    if (!a || !a.id) return
    var name = clean(a.name).slice(0, 100) || "Linked account"
    var currency = /^[A-Z]{3}$/.test(String(a.currency || "")) ? a.currency : "USD"
    var transactions = []
    ;(Array.isArray(a.transactions) ? a.transactions : []).forEach(function (t) {
      if (!t || !t.id) return
      var cents = toCents(t.amount)
      if (cents === null) return
      // A pending charge may have no posted date yet (0): use when it happened, or today.
      var posted = day(t.posted) || day(t.transacted_at)
      if (!posted) return
      transactions.push({
        external_id: (PREFIX + String(t.id)).slice(0, 200),
        posted: posted,
        amount_cents: cents,
        description: clean(t.description || t.payee).slice(0, 500),
        payee: clean(t.payee).slice(0, 200),
        pending: !!t.pending,
      })
    })
    accounts.push({
      external_id: (PREFIX + String(a.id)).slice(0, 200),
      name: name,
      institution: institutions[a.conn_id] || clean(a.org && a.org.name).slice(0, 100),
      kind: guessKind(name),
      last4: last4(name),
      currency: currency,
      balance_cents: toCents(a.balance),
      balance_date: day(a["balance-date"]),
      transactions: transactions,
    })
  })
  return { errors: errors, accounts: accounts }
}

/** What a failed /accounts request means for the link. 403: access revoked, so the person must link again. */
function accountsFailure(statusCode) {
  if (statusCode === 403) return { status: "reconnect", message: "SimpleFIN no longer lets Cheddar in. Link the bank again with a new setup token." }
  if (statusCode === 402) return { status: "error", message: "SimpleFIN says your subscription needs paying. Sort it out in SimpleFIN, then sync again." }
  return { status: "error", message: "SimpleFIN didn't answer (status " + statusCode + "). Cheddar will try again at the next sync." }
}

module.exports = {
  DEFAULT_ORIGINS: DEFAULT_ORIGINS,
  MIN_SYNC_GAP_MS: MIN_SYNC_GAP_MS,
  PREFIX: PREFIX,
  base64Decode: base64Decode,
  base64Encode: base64Encode,
  config: config,
  isEnabled: isEnabled,
  claimUrl: claimUrl,
  claimRequest: claimRequest,
  accessFromClaim: accessFromClaim,
  accountsRequest: accountsRequest,
  windowStart: windowStart,
  toCents: toCents,
  day: day,
  clean: clean,
  guessKind: guessKind,
  last4: last4,
  parseAccountSet: parseAccountSet,
  accountsFailure: accountsFailure,
}
