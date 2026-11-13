/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Plaid (https://plaid.com/docs/): linking a bank or card account by signing
// in to the bank itself, so balances and transactions arrive without a file.
// Plain values in and out, so Node can run it; pb_hooks/glue/plaid.js sends
// the requests and writes the records.
//
// How linking works:
//   1. Cheddar asks Plaid for a link_token (/link/token/create) and the page
//      opens Plaid Link with it. The person picks their bank and signs in to
//      it there: their bank password goes to the bank, never to Cheddar.
//   2. Link hands the page a public_token, good for 30 minutes. Cheddar
//      swaps it for an access_token (/item/public_token/exchange), which it
//      keeps encrypted. The token reads accounts and transactions; it can't
//      move money, and it's useless without Cheddar's own Plaid secret.
//   3. /accounts/get gives balances; /transactions/sync gives what's new
//      since the cursor saved last time.
// ---------------------------------------------------------------------------

/** Account and transaction ids carry this prefix, so they can never equal a file import's ("fitid:", "csv:"). */
var PREFIX = "plaid:"

/** A manual sync this soon after the last one answers the last one's result. */
var MIN_SYNC_GAP_MS = 2 * 60 * 1000

/** /transactions/sync pages per sync (500 transactions each); the next sync carries on from the cursor. */
var MAX_PAGES = 40

var BASES = { sandbox: "https://sandbox.plaid.com", production: "https://production.plaid.com" }

/** Bank linking's settings, from `getenv` (an environment reader such as $os.getenv). */
function config(getenv) {
  var env = String(getenv("PLAID_ENV") || "sandbox").trim().toLowerCase()
  return {
    // 32 characters: what $security.encrypt takes for AES-256. Each link's
    // access token is stored encrypted with it.
    key: String(getenv("BANK_LINK_KEY") || ""),
    clientId: String(getenv("PLAID_CLIENT_ID") || "").trim(),
    secret: String(getenv("PLAID_SECRET") || "").trim(),
    env: BASES[env] ? env : "sandbox",
    // Only the API suite's stand-in sets this.
    base: String(getenv("PLAID_API_URL") || "").trim().replace(/\/+$/, "") || BASES[BASES[env] ? env : "sandbox"],
    // Plaid bills whoever runs Cheddar for each linked bank, so new links stop
    // at these. Signing in to a bank again is never counted as a new link.
    perPerson: whole(getenv("PLAID_LINKS_PER_PERSON"), DEFAULT_LINKS_PER_PERSON),
    // 0: no limit for the whole Cheddar.
    maxLinks: whole(getenv("PLAID_MAX_LINKS"), 0),
  }
}

/** A whole number of 0 or more from the environment, or `fallback` when it's unset or unreadable. */
function whole(value, fallback) {
  var s = String(value || "").trim()
  return /^\d{1,6}$/.test(s) ? parseInt(s, 10) : fallback
}

var DEFAULT_LINKS_PER_PERSON = 10

/**
 * Why one more link can't be made, or "" when it can: `mine` is how many the
 * person has, `all` how many this Cheddar has. `who` says which limit it was,
 * for the log: "person" or "instance".
 */
function linkLimit(cfg, mine, all) {
  if (cfg.maxLinks > 0 && all >= cfg.maxLinks) {
    return { who: "instance", limit: cfg.maxLinks, message: "This Cheddar has as many linked banks as whoever runs it allows. Ask them to raise the limit, or add the account yourself and import its statements." }
  }
  if (mine >= cfg.perPerson) {
    return { who: "person", limit: cfg.perPerson, message: "That's as many linked banks as one person can have here (" + cfg.perPerson + "). Unlink one first, or add the account yourself and import its statements." }
  }
  return null
}

/** Linking is on with the key and both Plaid keys; without any of them, it's off. */
function isEnabled(cfg) {
  return cfg.key.length === 32 && !!cfg.clientId && !!cfg.secret
}

/** One Plaid API call, as $http.send takes it. The keys go in the body, as Plaid documents. */
function request(cfg, path, body) {
  var payload = { client_id: cfg.clientId, secret: cfg.secret }
  for (var k in body) payload[k] = body[k]
  return {
    method: "POST",
    url: cfg.base + path,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeout: 60,
  }
}

/**
 * The /link/token/create body for a person. With `accessToken`, Link opens
 * in update mode: the person signs in to the bank again for a link that
 * stopped working, and keeps the same link.
 */
function linkTokenBody(userId, accessToken) {
  var body = {
    client_name: "Cheddar",
    user: { client_user_id: String(userId) },
    country_codes: ["US"],
    language: "en",
  }
  if (accessToken) {
    body.access_token = accessToken
  }
  else {
    body.products = ["transactions"]
    body.transactions = { days_requested: 90 }
  }
  return body
}

/** A message from Plaid, safe to store and show: one line, no control characters, 300 characters at most. */
function clean(text) {
  // eslint-disable-next-line no-control-regex
  return String(text === undefined || text === null ? "" : text).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)
}

/** Plaid error codes that mean the person must sign in to their bank again. */
var RECONNECT = ["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT", "ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN", "ACCESS_NOT_GRANTED", "USER_PERMISSION_REVOKED", "NO_ACCOUNTS"]

/**
 * What a failed Plaid call means: { code, status, message }. `status` is
 * "reconnect" when only signing in to the bank again will help, else "error"
 * (the next sync may work).
 */
function failure(statusCode, json) {
  var e = json && typeof json === "object" ? json : {}
  var code = String(e.error_code || "")
  if (statusCode === 0) return { code: "UNREACHABLE", status: "error", message: "Cheddar couldn't reach Plaid. It will try again at the next sync." }
  if (RECONNECT.indexOf(code) !== -1) {
    return { code: code, status: "reconnect", message: "Your bank needs you to sign in again. Tap Sign in again to reconnect it." }
  }
  if (code === "INVALID_API_KEYS" || code === "INVALID_CLIENT_ID" || code === "INVALID_SECRET") {
    return { code: code, status: "error", message: "Plaid refused this server's keys. Whoever runs this Cheddar needs to check PLAID_CLIENT_ID and PLAID_SECRET." }
  }
  var shown = clean(e.display_message)
  return { code: code || "HTTP_" + statusCode, status: "error", message: shown || "Plaid couldn't answer just now (" + (code || "status " + statusCode) + "). Cheddar will try again at the next sync." }
}

/** A decimal string such as "-1234.5" as whole cents, rounding half away from zero; null if it isn't a number. No float arithmetic, so nothing drifts. */
function toCents(value) {
  if (value === undefined || value === null || value === "") return null
  var s = typeof value === "number" ? (isFinite(value) ? String(value) : "") : String(value)
  // A number Plaid sends as 1e-7 or similar is as good as zero.
  if (/e/i.test(s)) s = Number(s).toFixed(4)
  var m = /^\s*([+-])?(\d*)(?:\.(\d*))?\s*$/.exec(s)
  if (!m || (!m[2] && !m[3])) return null
  var frac = (m[3] || "") + "000"
  var cents = Number(m[2] || "0") * 100 + Number(frac.slice(0, 2))
  if (Number(frac[2]) >= 5) cents += 1
  if (!isFinite(cents)) return null
  return m[1] === "-" && cents !== 0 ? -cents : cents
}

var RETIREMENT = ["401a", "401k", "403b", "403B", "457b", "ira", "roth", "roth 401k", "sep ira", "simple ira", "pension", "retirement", "keogh", "sarsep", "profit sharing plan", "thrift savings plan", "lif", "lira", "lrif", "lrsp", "prif", "rdsp", "resp", "rlif", "rrif", "rrsp", "sipp", "tfsa", "hsa"]

/** Cheddar's kind for a Plaid account type and subtype. */
function kindOf(type, subtype) {
  var t = String(type || "").toLowerCase()
  var s = String(subtype || "").toLowerCase()
  if (t === "depository") return /saving|money market|cd/.test(s) ? "savings" : "checking"
  if (t === "credit") return "credit_card"
  if (t === "loan") return "loan"
  if (t === "investment" || t === "brokerage") return RETIREMENT.indexOf(s) !== -1 ? "retirement" : "brokerage"
  return "other"
}

/** What a liability owes is negative in Cheddar; Plaid gives it as a positive balance. */
function isLiability(type) {
  var t = String(type || "").toLowerCase()
  return t === "credit" || t === "loan"
}

/** /accounts/get's accounts as Cheddar's rows, with `institution` as the bank's name. */
function accountRows(json, institution, today) {
  var list = json && Array.isArray(json.accounts) ? json.accounts : []
  var rows = []
  list.forEach(function (a) {
    if (!a || !a.account_id) return
    var b = a.balances || {}
    var cents = toCents(b.current !== null && b.current !== undefined ? b.current : b.available)
    if (cents !== null && isLiability(a.type)) cents = -cents
    var currency = /^[A-Z]{3}$/.test(String(b.iso_currency_code || "")) ? b.iso_currency_code : "USD"
    rows.push({
      external_id: (PREFIX + a.account_id).slice(0, 200),
      plaid_id: String(a.account_id),
      name: clean(a.name || a.official_name).slice(0, 100) || "Linked account",
      institution: clean(institution).slice(0, 100),
      kind: kindOf(a.type, a.subtype),
      last4: /^\d{4}$/.test(String(a.mask || "")) ? a.mask : "",
      currency: currency,
      balance_cents: cents,
      balance_date: today,
    })
  })
  return rows
}

/**
 * A Plaid transaction as Cheddar's row, or null if it can't be read. Plaid
 * counts money out as positive; Cheddar counts it as negative.
 */
function transactionRow(t) {
  if (!t || !t.transaction_id || !t.account_id) return null
  var cents = toCents(t.amount)
  if (cents === null) return null
  var posted = /^\d{4}-\d{2}-\d{2}$/.test(String(t.date || "")) ? t.date : (/^\d{4}-\d{2}-\d{2}$/.test(String(t.authorized_date || "")) ? t.authorized_date : "")
  if (!posted) return null
  return {
    external_id: (PREFIX + t.transaction_id).slice(0, 200),
    account: (PREFIX + t.account_id).slice(0, 200),
    posted: posted,
    amount_cents: cents === 0 ? 0 : -cents,
    description: clean(t.name || t.merchant_name).slice(0, 500),
    payee: clean(t.merchant_name).slice(0, 200),
    pending: !!t.pending,
    bank_category: bankCategory(t.personal_finance_category),
  }
}

/** Plaid's personal_finance_category as one code to keep: the detailed one ("FOOD_AND_DRINK_COFFEE"), else the primary, else "". */
function bankCategory(pfc) {
  if (!pfc || typeof pfc !== "object") return ""
  var code = String(pfc.detailed || pfc.primary || "").toUpperCase()
  return /^[A-Z_]{1,100}$/.test(code) ? code : ""
}

/** One /transactions/sync page as { added, modified, removed (external ids), cursor, more }. */
function syncPage(json) {
  var j = json && typeof json === "object" ? json : {}
  var rows = function (list) {
    var out = []
    ;(Array.isArray(list) ? list : []).forEach(function (t) {
      var r = transactionRow(t)
      if (r) out.push(r)
    })
    return out
  }
  return {
    added: rows(j.added),
    modified: rows(j.modified),
    removed: (Array.isArray(j.removed) ? j.removed : []).filter(function (r) { return r && r.transaction_id }).map(function (r) { return (PREFIX + r.transaction_id).slice(0, 200) }),
    cursor: String(j.next_cursor || ""),
    more: !!j.has_more,
  }
}

module.exports = {
  PREFIX: PREFIX,
  MIN_SYNC_GAP_MS: MIN_SYNC_GAP_MS,
  MAX_PAGES: MAX_PAGES,
  config: config,
  isEnabled: isEnabled,
  linkLimit: linkLimit,
  request: request,
  linkTokenBody: linkTokenBody,
  clean: clean,
  failure: failure,
  toCents: toCents,
  kindOf: kindOf,
  accountRows: accountRows,
  bankCategory: bankCategory,
  transactionRow: transactionRow,
  syncPage: syncPage,
}
