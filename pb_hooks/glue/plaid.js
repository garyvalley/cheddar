/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/plaid.js with the environment read, the requests sent and the records
// written. Required inside a handler body, not at file scope: PocketBase's
// JSVM pool does not share file-level declarations with hook callbacks.
//
// Writes go through the app, not the record API, so they bypass collection
// rules: every account and transaction written here takes its owner from the
// link, and is looked up by that owner, never by an id the caller sent.
// ---------------------------------------------------------------------------

var plaid = require(`${__hooks}/lib/plaid.js`)
var dates = require(`${__hooks}/lib/dates.js`)

function cfg() {
  return plaid.config($os.getenv)
}

/** A failed Plaid call: `failure` is lib/plaid.js's { code, status, message }. */
function PlaidError(failure) {
  this.failure = failure
}

/** One Plaid call: its JSON on success, or throws a PlaidError. */
function call(path, body) {
  var res
  try {
    res = $http.send(plaid.request(cfg(), path, body))
  }
  catch (_) {
    throw new PlaidError(plaid.failure(0, null))
  }
  if (res.statusCode !== 200) {
    var f = plaid.failure(res.statusCode, res.json)
    console.log("[plaid] " + path + " failed: " + f.code)
    throw new PlaidError(f)
  }
  return res.json
}

function encrypt(text) {
  return $security.encrypt(text, cfg().key)
}

/** The link's access token, or null if it can't be read (BANK_LINK_KEY changed). */
function accessOf(link) {
  try {
    return toString($security.decrypt(link.getString("access"), cfg().key))
  }
  catch (_) {
    return null
  }
}

/** A link_token for Plaid Link: a new link, or with `link`, signing in again to that one. */
function linkToken(userId, link) {
  var access = null
  if (link) {
    access = accessOf(link)
    if (!access) throw new PlaidError({ code: "UNREADABLE", status: "reconnect", message: "Cheddar can no longer read this link. Remove it and link the bank again." })
  }
  return String(call("/link/token/create", plaid.linkTokenBody(userId, access)).link_token || "")
}

/** Swaps Link's public_token for an access token and Plaid's id for the link. */
function exchange(publicToken) {
  var out = call("/item/public_token/exchange", { public_token: publicToken })
  return { access: String(out.access_token || ""), itemId: String(out.item_id || "") }
}

/** The link as the app shows it. */
function summary(app, link) {
  var accounts = app.findRecordsByFilter("accounts", "link = {:id}", "name", 0, 0, { id: link.id })
  return {
    id: link.id,
    provider: link.getString("provider"),
    institutions: link.get("institutions") || [],
    status: link.getString("status"),
    message: link.getString("message"),
    last_synced: link.getString("last_synced"),
    accounts: accounts.map(function (a) {
      return {
        id: a.id,
        name: a.getString("name"),
        institution: a.getString("institution"),
        kind: a.getString("kind"),
        last4: a.getString("last4"),
        balance_cents: a.get("balance_cents"),
        balance_date: a.getString("balance_date"),
      }
    }),
  }
}

/** The account a Plaid account syncs into, made the first time it's seen. */
function accountFor(txApp, link, row) {
  var owner = link.getString("owner")
  var account
  try {
    account = txApp.findFirstRecordByFilter("accounts", "owner = {:owner} && external_id = {:ext}", { owner: owner, ext: row.external_id })
  }
  catch (_) {
    account = new Record(txApp.findCollectionByNameOrId("accounts"))
    account.set("owner", owner)
    account.set("external_id", row.external_id)
    account.set("source", "sync")
    // Only the first time: after that the name and kind are the person's.
    account.set("name", row.name)
    account.set("kind", row.kind)
    if (row.last4) account.set("last4", row.last4)
  }
  account.set("link", link.id)
  if (row.institution) account.set("institution", row.institution)
  account.set("currency", row.currency)
  if (row.balance_cents !== null) {
    account.set("balance_cents", row.balance_cents)
    account.set("balance_date", row.balance_date)
  }
  txApp.save(account)
  return account
}

/** Adds or brings up to date one transaction; answers "added", "updated" or "". */
function upsert(txApp, collection, account, t) {
  var rec
  try {
    rec = txApp.findFirstRecordByFilter("transactions", "account = {:account} && external_id = {:ext}", { account: account.id, ext: t.external_id })
  }
  catch (_) {
    rec = null
  }
  var outcome = "updated"
  if (rec) {
    if (rec.getString("posted") === t.posted && rec.getInt("amount_cents") === t.amount_cents
      && rec.getBool("pending") === t.pending && rec.getString("description") === t.description
      && rec.getString("bank_category") === t.bank_category) return ""
  }
  else {
    rec = new Record(collection)
    rec.set("owner", account.getString("owner"))
    rec.set("account", account.id)
    rec.set("source", "sync")
    rec.set("external_id", t.external_id)
    // The bank's own words; the person's edits to these later stay theirs.
    rec.set("payee", t.payee)
    outcome = "added"
  }
  rec.set("posted", t.posted)
  rec.set("amount_cents", t.amount_cents)
  rec.set("description", t.description)
  rec.set("pending", t.pending)
  // Plaid's category; pb_hooks/categories.pb.js sorts the row by it as it saves.
  rec.set("bank_category", t.bank_category)
  txApp.save(rec)
  return outcome
}

/** Fetches every page of what's changed since `cursor`. Answers { added, modified, removed, cursor }. */
function fetchChanges(access, cursor) {
  var all = { added: [], modified: [], removed: [], cursor: cursor }
  for (var page = 0; page < plaid.MAX_PAGES; page++) {
    var body = { access_token: access, count: 500 }
    if (all.cursor) body.cursor = all.cursor
    var p = plaid.syncPage(call("/transactions/sync", body))
    all.added = all.added.concat(p.added)
    all.modified = all.modified.concat(p.modified)
    all.removed = all.removed.concat(p.removed)
    all.cursor = p.cursor || all.cursor
    if (!p.more) break
  }
  return all
}

/** Records a failed sync on the link; answers the sync result. */
function failed(app, link, f, result) {
  link.set("status", f.status)
  link.set("message", f.message)
  app.save(link)
  result.problem = f.message
  return result
}

/**
 * Fetches the link's balances and new transactions and writes them. Records
 * the outcome on the link either way, and answers
 * { ok, added, updated, removed, problem? }.
 */
function sync(app, link) {
  var now = Date.now()
  var result = { ok: false, added: 0, updated: 0, removed: 0 }
  link.set("last_attempt", dates.toPb(now))

  var access = accessOf(link)
  if (!access) {
    return failed(app, link, { status: "reconnect", message: "Cheddar can no longer read this link. Remove it and link the bank again." }, result)
  }

  var accounts
  var changes
  try {
    accounts = call("/accounts/get", { access_token: access })
    try {
      changes = fetchChanges(access, link.getString("cursor"))
    }
    catch (err) {
      // The bank's data changed between pages: start again from the saved cursor, once.
      if (!(err instanceof PlaidError) || err.failure.code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") throw err
      changes = fetchChanges(access, link.getString("cursor"))
    }
  }
  catch (err) {
    if (err instanceof PlaidError) return failed(app, link, err.failure, result)
    throw err
  }

  var item = accounts.item || {}
  var institution = plaid.clean(item.institution_name) || (link.get("institutions") || [])[0] || ""
  var rows = plaid.accountRows(accounts, institution, new Date(now).toISOString().slice(0, 10))

  app.runInTransaction(function (txApp) {
    var byPlaidId = {}
    rows.forEach(function (row) { byPlaidId[row.external_id] = accountFor(txApp, link, row) })
    var collection = txApp.findCollectionByNameOrId("transactions")
    changes.added.concat(changes.modified).forEach(function (t) {
      var account = byPlaidId[t.account]
      if (!account) return
      var outcome = upsert(txApp, collection, account, t)
      if (outcome === "added") result.added++
      else if (outcome === "updated") result.updated++
    })
    // A pending charge that posts comes back removed, and again as a new
    // transaction; a refunded or cancelled one is just removed.
    changes.removed.forEach(function (ext) {
      txApp.findRecordsByFilter("transactions", "owner = {:owner} && source = 'sync' && external_id = {:ext}", "", 0, 0,
        { owner: link.getString("owner"), ext: ext }).forEach(function (rec) {
        txApp.delete(rec)
        result.removed++
      })
    })
    if (institution) link.set("institutions", [institution])
    link.set("cursor", changes.cursor)
    link.set("status", "ok")
    link.set("message", "")
    link.set("last_synced", dates.toPb(now))
    txApp.save(link)
  })
  result.ok = true
  return result
}

/** The caller's own link, or a 404 for one that isn't theirs. */
function ownLink(app, auth, id) {
  try {
    var link = app.findRecordById("bank_links", id)
    if (link.getString("owner") === auth.id) return link
  }
  catch (_) { /* not found: the same answer as someone else's */ }
  throw new NotFoundError("That link isn't there.")
}

/**
 * Removes a link: Plaid forgets the access token (so no one is billed for
 * it), and its accounts and their transactions stay, as accounts that no
 * longer sync.
 */
function remove(app, link) {
  var access = accessOf(link)
  if (access) {
    try {
      call("/item/remove", { access_token: access })
    }
    catch (err) {
      // Already gone at Plaid, or Plaid unreachable: the link goes from Cheddar regardless.
      console.log("[plaid] /item/remove for " + link.id + " failed: " + (err.failure ? err.failure.code : err))
    }
  }
  app.runInTransaction(function (txApp) {
    txApp.findRecordsByFilter("accounts", "link = {:id}", "", 0, 0, { id: link.id }).forEach(function (a) {
      a.set("link", "")
      txApp.save(a)
    })
    txApp.delete(link)
  })
}

module.exports = {
  PlaidError: PlaidError,
  cfg: cfg,
  encrypt: encrypt,
  linkToken: linkToken,
  exchange: exchange,
  summary: summary,
  sync: sync,
  ownLink: ownLink,
  remove: remove,
}
