/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Linking bank and card accounts through SimpleFIN, so balances and
// transactions arrive without a file (lib/simplefin.js says how SimpleFIN
// works). Off unless BANK_LINK_KEY is set: the access a link holds is never
// stored in the clear.
//
//   GET  /api/bank-links                 -> { enabled, links: [summary] }
//   POST /api/bank-links                 { setup_token } -> { link, sync }: links and syncs
//   POST /api/bank-links/{id}/sync       -> { link, sync }
//   POST /api/bank-links/{id}/remove     -> 204; its accounts stay, unlinked
//
// Each needs a session with two-step sign-in on, like every collection that
// holds financial data (migrations/README.md). Every link also syncs once a
// day on its own.
//
// Settings, from the environment:
//   BANK_LINK_KEY               32 characters; encrypts each link's access
//   SIMPLEFIN_ALLOWED_ORIGINS   comma-separated; where setup tokens may point
//                               (default: SimpleFIN Bridge)
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
  var glue = require(`${__hooks}/glue/simplefin.js`)
  var sf = require(`${__hooks}/lib/simplefin.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var links = e.app.findRecordsByFilter("bank_links", "owner = {:owner}", "created", 0, 0, { owner: e.auth.id })
  return e.json(200, {
    enabled: sf.isEnabled(glue.cfg()),
    links: links.map(function (l) { return glue.summary(e.app, l) }),
  })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links", (e) => {
  var glue = require(`${__hooks}/glue/simplefin.js`)
  var sf = require(`${__hooks}/lib/simplefin.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!sf.isEnabled(glue.cfg())) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")

  var token = String((e.requestInfo().body || {}).setup_token || "").trim()
  if (!token) throw new BadRequestError("Paste your SimpleFIN setup token.")
  if (token.length > 2000) throw new BadRequestError("That isn't a SimpleFIN setup token.")
  if (e.app.countRecords("bank_links", $dbx.hashExp({ owner: e.auth.id })) >= 25) {
    throw new BadRequestError("That's as many links as one account can have. Remove one first.")
  }

  var access
  try {
    access = glue.claim(token)
  }
  catch (err) {
    if (err instanceof glue.Problem) throw new BadRequestError(err.problem)
    throw err
  }

  var link = new Record(e.app.findCollectionByNameOrId("bank_links"))
  link.set("owner", e.auth.id)
  link.set("provider", "simplefin")
  link.set("access", glue.encrypt(access))
  link.set("institutions", [])
  link.set("status", "ok")
  e.app.save(link)

  // The token is spent and the link saved: a failed first sync is the
  // link's status to show, not a failed request.
  var result = glue.sync(e.app, link)
  return e.json(200, { link: glue.summary(e.app, e.app.findRecordById("bank_links", link.id)), sync: result })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/{id}/sync", (e) => {
  var glue = require(`${__hooks}/glue/simplefin.js`)
  var sf = require(`${__hooks}/lib/simplefin.js`)
  var dates = require(`${__hooks}/lib/dates.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!sf.isEnabled(glue.cfg())) throw new BadRequestError("Linking banks isn't switched on for this Cheddar.")
  var link = glue.ownLink(e.app, e.auth, e.request.pathValue("id"))

  // SimpleFIN Bridge refreshes from the bank about once a day and limits
  // how often an app may ask: a tap moments after the last sync answers that.
  var last = dates.parsePb(link.getString("last_attempt"))
  if (last && Date.now() - last.getTime() < sf.MIN_SYNC_GAP_MS) {
    return e.json(200, { link: glue.summary(e.app, link), sync: { ok: link.getString("status") === "ok", added: 0, updated: 0, removed: 0, recent: true } })
  }
  var result = glue.sync(e.app, link)
  return e.json(200, { link: glue.summary(e.app, e.app.findRecordById("bank_links", link.id)), sync: result })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/bank-links/{id}/remove", (e) => {
  var glue = require(`${__hooks}/glue/simplefin.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  glue.remove(e.app, glue.ownLink(e.app, e.auth, e.request.pathValue("id")))
  return e.noContent(204)
}, $apis.requireAuth("users"))

// Every link, once a day, after SimpleFIN Bridge's own overnight refresh.
// One link failing never stops the rest.
cronAdd("bank_links_sync", "17 11 * * *", () => {
  var glue = require(`${__hooks}/glue/simplefin.js`)
  var sf = require(`${__hooks}/lib/simplefin.js`)
  if (!sf.isEnabled(glue.cfg())) return
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
