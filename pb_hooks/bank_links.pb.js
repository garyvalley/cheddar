/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Linking bank and card accounts through a provider (glue/providers.js; Plaid
// today): the person signs in to their bank in the provider's window, and
// Cheddar keeps only the resulting access token, encrypted -- never the bank
// password (lib/plaid.js says how Plaid's works). Off unless a data key
// (DATA_KEYS, or BANK_LINK_KEY) and the provider's settings
// (PLAID_CLIENT_ID, PLAID_SECRET) are all set.
//
//   GET  /api/bank-links                   -> { enabled, links: [summary], full };
//                                          full: why no new link can be made, or null
//   POST /api/bank-links/link-token        { link? } -> { link_token } to open Plaid Link;
//                                          with a link's id, to sign in to that bank again
//   POST /api/bank-links                   { public_token, institution? } -> { link, sync }
//   POST /api/bank-links/{id}/sync         -> { link, sync }
//   POST /api/bank-links/{id}/remove       -> 204; its accounts stay, unlinked
//   GET  /api/bank-links/webhook-key?kid=  -> { key } (a JWK) the provider signs webhooks with
//   POST /api/bank-links/webhook           { item_id, webhook_type, webhook_code, ... }
//                                          -> { done }; syncs the link it names
//
// The two webhook routes take no sign-in: Plaid calls Nuxt's public
// /api/webhooks/plaid, which checks the webhook's signature with that key
// before passing it on (server/data/plaid-webhook.ts). PocketBase itself is
// never public. Even unchecked, a webhook can only sync a link sooner than
// the daily sync would, and not twice within MIN_SYNC_GAP_MS.
//
// A new link and an unlink want the password typed in the last 15 minutes
// (POST /api/sessions/confirm), or answer 403 with data.password "required".
//
// Each needs a session with two-step sign-in on, like every collection that
// holds financial data (migrations/README.md). Every link also syncs once a
// day on its own.
//
// Settings, from the environment:
//   DATA_KEYS          "v2:<32 characters>,v1:<32 characters>", newest first;
//                      seals each link's access token (lib/data_keys.js)
//   BANK_LINK_KEY      32 characters; before DATA_KEYS, key v1
//   PLAID_CLIENT_ID    from dashboard.plaid.com, Developers -> Keys
//   PLAID_SECRET       the secret for PLAID_ENV
//   PLAID_ENV          sandbox (default) or production
//   PLAID_LINKS_PER_PERSON  links each person may have (default 10)
//   PLAID_MAX_LINKS    links the whole Cheddar may have (default 0: no limit);
//                      Plaid bills whoever runs Cheddar for each one
//   PLAID_API_URL      tests only: a stand-in Plaid
// ---------------------------------------------------------------------------

// Only these hooks set an account's link (migrations/0004_bank_links.mjs).
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("link", "")
  e.next()
}, "accounts")

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("link", e.record.original().getString("link"))
  e.next()
}, "accounts")

// However a link's row goes -- unlinking, the cascade when its owner deletes
// their account, or a superuser in the admin UI -- its provider is told to
// forget it. After the delete commits, so a cascade never waits on it inside its
// transaction, and a delete that fails leaves the link working.
onRecordAfterDeleteSuccess((e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  glue.forget(e.record)
  e.next()
}, "bank_links")

routerAdd("GET", "/api/bank-links", (e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var links = e.app.findRecordsByFilter("bank_links", "owner = {:owner}", "created", 0, 0, { owner: e.auth.id })
  var enabled = glue.isEnabled()
  var hit = enabled ? glue.linkLimitFor(e.app, e.auth.id) : null
  return e.json(200, {
    enabled: enabled,
    links: links.map(function (l) { return glue.summary(e.app, l) }),
    full: hit ? hit.message : null,
  })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/link-token", (e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!glue.isEnabled()) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")
  var id = String((e.requestInfo().body || {}).link || "")
  var link = id ? glue.ownLink(e.app, e.auth, id) : null
  // A new link reads a bank's accounts from now on: it wants a password typed
  // in the last 15 minutes, not only a session (sessions.pb.js).
  if (!link) require(`${__hooks}/glue/sessions.js`).requireFreshPassword(e)
  if (!link) glue.checkLinkLimit(e.app, e.auth.id)
  try {
    return e.json(200, { link_token: glue.linkToken(e.auth.id, link) })
  }
  catch (err) {
    if (err instanceof glue.ProviderError) throw new BadRequestError(err.failure.message)
    throw err
  }
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links", (e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!glue.isEnabled()) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")
  var body = e.requestInfo().body || {}
  var publicToken = String(body.public_token || "").trim()
  if (!publicToken || publicToken.length > 300) throw new BadRequestError("The bank link didn't finish. Try again.")
  glue.checkLinkLimit(e.app, e.auth.id)
  var made
  try {
    made = glue.create(e.app, e.auth.id, publicToken, body.institution, body.today)
  }
  catch (err) {
    if (err instanceof glue.ProviderError) throw new BadRequestError(err.failure.message)
    throw err
  }
  require(`${__hooks}/glue/events.js`).record(e.app, e.auth.id, "bank_linked", e, glue.namesOf(made.link))
  return e.json(200, { link: glue.summary(e.app, made.link), sync: made.sync })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/{id}/sync", (e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  var dates = require(`${__hooks}/lib/dates.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!glue.isEnabled()) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")
  var link = glue.ownLink(e.app, e.auth, e.request.pathValue("id"))

  // A tap moments after the last sync answers that one, rather than asking
  // the provider again -- unless the person just signed in to the bank again.
  var fresh = !!(e.requestInfo().body || {}).reconnected
  var last = dates.parsePb(link.getString("last_attempt"))
  if (!fresh && last && Date.now() - last.getTime() < glue.minSyncGap(link)) {
    return e.json(200, { link: glue.summary(e.app, link), sync: { ok: link.getString("status") === "ok", added: 0, updated: 0, removed: 0, recent: true } })
  }
  var result = glue.sync(e.app, link, (e.requestInfo().body || {}).today)
  return e.json(200, { link: glue.summary(e.app, e.app.findRecordById("bank_links", link.id)), sync: result })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/{id}/remove", (e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var link = glue.ownLink(e.app, e.auth, e.request.pathValue("id"))
  require(`${__hooks}/glue/sessions.js`).requireFreshPassword(e)
  var names = glue.namesOf(link)
  glue.remove(e.app, link)
  require(`${__hooks}/glue/events.js`).record(e.app, e.auth.id, "bank_unlinked", e, names)
  return e.noContent(204)
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/bank-links/webhook-key", (e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  var providers = require(`${__hooks}/glue/providers.js`)
  if (!glue.isEnabled()) throw new NotFoundError("No webhooks here.")
  var kid = String(e.request.url.query().get("kid") || "")
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(kid)) throw new BadRequestError("That key id isn't one.")
  var key = null
  try {
    key = providers.current().webhookKey(kid)
  }
  catch (err) {
    if (!(err instanceof glue.ProviderError)) throw err
  }
  if (!key) throw new NotFoundError("No such key.")
  return e.json(200, { key: key })
})

routerAdd("POST", "/api/bank-links/webhook", (e) => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  var providers = require(`${__hooks}/glue/providers.js`)
  if (!glue.isEnabled()) return e.json(200, { done: "ignored" })
  return e.json(200, { done: glue.onWebhook(e.app, providers.current().name, e.requestInfo().body || {}) })
})

// Every link, once a day. One link failing never stops the rest. At 11:17 UTC
// it is that same date in every zone from UTC-11 to UTC+12, so the UTC day is
// each person's own.
cronAdd("bank_links_sync", "17 11 * * *", () => {
  var glue = require(`${__hooks}/glue/bank_links.js`)
  if (!glue.isEnabled()) return
  var links = $app.findRecordsByFilter("bank_links", "status != 'reconnect'", "", 0, 0)
  var failed = 0
  links.forEach(function (link) {
    try {
      var r = glue.sync($app, link)
      if (!r.ok) {
        failed++
        console.log("[bank_links] sync failed for " + link.id + ": " + r.problem)
      }
    }
    catch (err) {
      failed++
      console.log("[bank_links] sync threw for " + link.id + ": " + err)
    }
  })
  // With HEALTHCHECK_SYNC_URL set (security_events.pb.js), the day's sync
  // pings it: a ping that doesn't come, or a /fail one with how many failed,
  // alerts whoever runs Cheddar.
  var hc = String($os.getenv("HEALTHCHECK_SYNC_URL") || "").trim().replace(/\/+$/, "")
  if (hc) {
    try {
      $http.send({ url: failed ? hc + "/fail" : hc, method: "POST", body: failed + " of " + links.length + " links failed to sync", timeout: 10 })
    }
    catch (err) {
      console.log("[bank_links] sync ping failed: " + err)
    }
  }
})
