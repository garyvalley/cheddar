/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Linking bank and card accounts through Plaid: the person signs in to their
// bank in Plaid Link, and Cheddar keeps only the resulting access token,
// encrypted -- never the bank password (lib/plaid.js says how it works).
// Off unless BANK_LINK_KEY, PLAID_CLIENT_ID and PLAID_SECRET are all set.
//
//   GET  /api/bank-links                   -> { enabled, links: [summary] }
//   POST /api/bank-links/link-token        { link? } -> { link_token } to open Plaid Link;
//                                          with a link's id, to sign in to that bank again
//   POST /api/bank-links                   { public_token, institution? } -> { link, sync }
//   POST /api/bank-links/{id}/sync         -> { link, sync }
//   POST /api/bank-links/{id}/remove       -> 204; its accounts stay, unlinked
//
// Each needs a session with two-step sign-in on, like every collection that
// holds financial data (migrations/README.md). Every link also syncs once a
// day on its own.
//
// Settings, from the environment:
//   BANK_LINK_KEY      32 characters; encrypts each link's access token
//   PLAID_CLIENT_ID    from dashboard.plaid.com, Developers -> Keys
//   PLAID_SECRET       the secret for PLAID_ENV
//   PLAID_ENV          sandbox (default) or production
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

routerAdd("GET", "/api/bank-links", (e) => {
  var glue = require(`${__hooks}/glue/plaid.js`)
  var plaid = require(`${__hooks}/lib/plaid.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var links = e.app.findRecordsByFilter("bank_links", "owner = {:owner}", "created", 0, 0, { owner: e.auth.id })
  return e.json(200, {
    enabled: plaid.isEnabled(glue.cfg()),
    links: links.map(function (l) { return glue.summary(e.app, l) }),
  })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/link-token", (e) => {
  var glue = require(`${__hooks}/glue/plaid.js`)
  var plaid = require(`${__hooks}/lib/plaid.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!plaid.isEnabled(glue.cfg())) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")
  var id = String((e.requestInfo().body || {}).link || "")
  var link = id ? glue.ownLink(e.app, e.auth, id) : null
  if (!link && e.app.countRecords("bank_links", $dbx.hashExp({ owner: e.auth.id })) >= 25) {
    throw new BadRequestError("That's as many linked banks as one account can have. Remove one first.")
  }
  try {
    return e.json(200, { link_token: glue.linkToken(e.auth.id, link) })
  }
  catch (err) {
    if (err instanceof glue.PlaidError) throw new BadRequestError(err.failure.message)
    throw err
  }
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links", (e) => {
  var glue = require(`${__hooks}/glue/plaid.js`)
  var plaid = require(`${__hooks}/lib/plaid.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!plaid.isEnabled(glue.cfg())) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")

  var body = e.requestInfo().body || {}
  var publicToken = String(body.public_token || "").trim()
  if (!/^public-[a-z]+-[A-Za-z0-9-]{8,200}$/.test(publicToken)) throw new BadRequestError("Plaid didn't finish linking. Try again.")
  if (e.app.countRecords("bank_links", $dbx.hashExp({ owner: e.auth.id })) >= 25) {
    throw new BadRequestError("That's as many linked banks as one account can have. Remove one first.")
  }

  var token
  try {
    token = glue.exchange(publicToken)
  }
  catch (err) {
    if (err instanceof glue.PlaidError) throw new BadRequestError(err.failure.message)
    throw err
  }
  if (!token.access) throw new BadRequestError("Plaid didn't finish linking. Try again.")

  var link = new Record(e.app.findCollectionByNameOrId("bank_links"))
  link.set("owner", e.auth.id)
  link.set("provider", "plaid")
  link.set("access", glue.encrypt(token.access))
  link.set("item_id", token.itemId.slice(0, 200))
  // Link's own word for the bank, until Plaid's /accounts/get names it.
  var institution = plaid.clean(body.institution).slice(0, 100)
  link.set("institutions", institution ? [institution] : [])
  link.set("status", "ok")
  e.app.save(link)

  // The link is saved: a failed first sync is the link's status to show, not a failed request.
  var result = glue.sync(e.app, link)
  return e.json(200, { link: glue.summary(e.app, e.app.findRecordById("bank_links", link.id)), sync: result })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/{id}/sync", (e) => {
  var glue = require(`${__hooks}/glue/plaid.js`)
  var plaid = require(`${__hooks}/lib/plaid.js`)
  var dates = require(`${__hooks}/lib/dates.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!plaid.isEnabled(glue.cfg())) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")
  var link = glue.ownLink(e.app, e.auth, e.request.pathValue("id"))

  // A tap moments after the last sync answers that one, rather than asking
  // Plaid again -- unless the person just signed in to the bank again.
  var fresh = !!(e.requestInfo().body || {}).reconnected
  var last = dates.parsePb(link.getString("last_attempt"))
  if (!fresh && last && Date.now() - last.getTime() < plaid.MIN_SYNC_GAP_MS) {
    return e.json(200, { link: glue.summary(e.app, link), sync: { ok: link.getString("status") === "ok", added: 0, updated: 0, removed: 0, recent: true } })
  }
  var result = glue.sync(e.app, link)
  return e.json(200, { link: glue.summary(e.app, e.app.findRecordById("bank_links", link.id)), sync: result })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/{id}/remove", (e) => {
  var glue = require(`${__hooks}/glue/plaid.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  glue.remove(e.app, glue.ownLink(e.app, e.auth, e.request.pathValue("id")))
  return e.noContent(204)
}, $apis.requireAuth("users"))

// Every link, once a day. One link failing never stops the rest.
cronAdd("bank_links_sync", "17 11 * * *", () => {
  var glue = require(`${__hooks}/glue/plaid.js`)
  var plaid = require(`${__hooks}/lib/plaid.js`)
  if (!plaid.isEnabled(glue.cfg())) return
  var links = $app.findRecordsByFilter("bank_links", "status != 'reconnect'", "", 0, 0)
  links.forEach(function (link) {
    try {
      var r = glue.sync($app, link)
      if (!r.ok) console.log("[bank_links] sync failed for " + link.id + ": " + r.problem)
    }
    catch (err) {
      console.log("[bank_links] sync threw for " + link.id + ": " + err)
    }
  })
})
