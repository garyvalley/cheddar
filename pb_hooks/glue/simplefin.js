/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/simplefin.js with the environment read, the requests sent and the
// records written. Required inside a handler body, not at file scope:
// PocketBase's JSVM pool does not share file-level declarations with hook
// callbacks.
//
// Writes go through the app, not the record API, so they bypass collection
// rules: every account and transaction written here takes its owner from the
// link, and is looked up by that owner, never by an id the caller sent.
// ---------------------------------------------------------------------------

var sf = require(`${__hooks}/lib/simplefin.js`)
var dates = require(`${__hooks}/lib/dates.js`)

function cfg() {
  return sf.config($os.getenv)
}

/** An error the routes answer with as a 400 and its own message. */
function Problem(message) {
  this.problem = message
}

function encrypt(text) {
  return $security.encrypt(text, cfg().key)
}

/** The link's access URL, or null if it can't be read (BANK_LINK_KEY changed). */
function accessOf(link) {
  try {
    return toString($security.decrypt(link.getString("access"), cfg().key))
  }
  catch (_) {
    return null
  }
}

/** Spends a setup token: answers the access URL, or throws a Problem. */
function claim(token) {
  var c = cfg()
  var url = sf.claimUrl(token, c)
  if (url.problem) throw new Problem(url.problem)
  var res
  try {
    res = $http.send(sf.claimRequest(url.url))
  }
  catch (_) {
    throw new Problem("Cheddar couldn't reach SimpleFIN. Your token wasn't used: try again in a minute.")
  }
  var out = sf.accessFromClaim(res.statusCode, toString(res.body), c)
  if (out.problem) throw new Problem(out.problem)
  return out.access
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
        balance_cents: a.get("balance_cents"),
        balance_date: a.getString("balance_date"),
      }
    }),
  }
}

/** The account a SimpleFIN account syncs into, made the first time it's seen. */
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
    account.set("balance_date", row.balance_date || new Date().toISOString().slice(0, 10))
  }
  txApp.save(account)
  return account
}

/**
 * Writes one account's transactions: new ones added, ones seen before
 * brought up to date (a pending charge posts, or its amount changes). A
 * pending one SimpleFIN no longer sends within the window has dropped or
 * posted under a new id, so it goes. Answers { added, updated, removed }.
 */
function writeTransactions(txApp, account, rows, fromDay) {
  var counts = { added: 0, updated: 0, removed: 0 }
  var collection = txApp.findCollectionByNameOrId("transactions")
  var seen = {}
  rows.forEach(function (t) {
    seen[t.external_id] = true
    var rec
    try {
      rec = txApp.findFirstRecordByFilter("transactions", "account = {:account} && external_id = {:ext}", { account: account.id, ext: t.external_id })
    }
    catch (_) {
      rec = null
    }
    if (rec) {
      if (rec.getString("posted") === t.posted && rec.getInt("amount_cents") === t.amount_cents
        && rec.getBool("pending") === t.pending && rec.getString("description") === t.description) return
      counts.updated++
    }
    else {
      rec = new Record(collection)
      rec.set("owner", account.getString("owner"))
      rec.set("account", account.id)
      rec.set("source", "sync")
      rec.set("external_id", t.external_id)
      // The bank's own words; the person's edits to these later stay theirs.
      rec.set("payee", t.payee)
      counts.added++
    }
    rec.set("posted", t.posted)
    rec.set("amount_cents", t.amount_cents)
    rec.set("description", t.description)
    rec.set("pending", t.pending)
    txApp.save(rec)
  })

  var stale = txApp.findRecordsByFilter("transactions",
    "account = {:account} && source = 'sync' && pending = true && posted >= {:from}", "", 0, 0,
    { account: account.id, from: fromDay })
  stale.forEach(function (rec) {
    if (seen[rec.getString("external_id")]) return
    txApp.delete(rec)
    counts.removed++
  })
  return counts
}

/**
 * Fetches the link's accounts and writes them. Records the outcome on the
 * link either way, and answers { ok, added, updated, removed, problem? }.
 */
function sync(app, link) {
  var now = Date.now()
  var result = { ok: false, added: 0, updated: 0, removed: 0 }
  link.set("last_attempt", dates.toPb(now))

  var access = accessOf(link)
  if (!access) {
    link.set("status", "reconnect")
    link.set("message", "Cheddar can no longer read this link's saved access. Link the bank again with a new setup token.")
    app.save(link)
    result.problem = link.getString("message")
    return result
  }

  var lastSynced = dates.parsePb(link.getString("last_synced"))
  var startS = sf.windowStart(lastSynced ? lastSynced.getTime() : 0, now)
  var res
  try {
    res = $http.send(sf.accountsRequest(access, startS))
  }
  catch (_) {
    res = { statusCode: 0 }
  }
  if (res.statusCode !== 200) {
    var failure = sf.accountsFailure(res.statusCode)
    link.set("status", failure.status)
    link.set("message", failure.message)
    app.save(link)
    result.problem = failure.message
    return result
  }

  var set = sf.parseAccountSet(res.json)
  var fromDay = sf.day(startS)
  var institutions = []
  app.runInTransaction(function (txApp) {
    set.accounts.forEach(function (row) {
      var account = accountFor(txApp, link, row)
      var c = writeTransactions(txApp, account, row.transactions, fromDay)
      result.added += c.added
      result.updated += c.updated
      result.removed += c.removed
      if (row.institution && institutions.indexOf(row.institution) === -1) institutions.push(row.institution)
    })
    if (institutions.length) link.set("institutions", institutions)
    link.set("status", "ok")
    // SimpleFIN's own word on an institution (a password changed at the
    // bank, say), shown with the link until it clears.
    link.set("message", set.errors.join(" ").slice(0, 1000))
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
 * Removes a link. Its accounts and their transactions stay, as accounts
 * that no longer sync; the person deletes them on the Accounts page if they
 * want them gone.
 */
function remove(app, link) {
  app.runInTransaction(function (txApp) {
    txApp.findRecordsByFilter("accounts", "link = {:id}", "", 0, 0, { id: link.id }).forEach(function (a) {
      a.set("link", "")
      txApp.save(a)
    })
    txApp.delete(link)
  })
}

module.exports = {
  Problem: Problem,
  cfg: cfg,
  encrypt: encrypt,
  claim: claim,
  summary: summary,
  sync: sync,
  ownLink: ownLink,
  remove: remove,
}
