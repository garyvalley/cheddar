/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// What a bank-link sync writes for each account and transaction it gets:
// the account it lands in, a transaction added or brought up to date, the
// statement row it takes over (shared/overlap.ts), and what a pending charge
// carries to the posted one. glue/bank_links.js runs the sync; this writes,
// inside its transaction. Required inside a handler body, like every glue
// module.
// ---------------------------------------------------------------------------

var overlap = require(`${__hooks}/lib/gen/overlap.js`);
var review = require(`${__hooks}/lib/gen/review.js`);

/** The account a Plaid account syncs into, made the first time it's seen. */
function accountFor(txApp, link, row) {
  var owner = link.getString("owner");
  var account;
  try {
    account = txApp.findFirstRecordByFilter(
      "accounts",
      "owner = {:owner} && external_id = {:ext}",
      { owner: owner, ext: row.external_id },
    );
  } catch (_) {
    account = new Record(txApp.findCollectionByNameOrId("accounts"));
    account.set("owner", owner);
    account.set("external_id", row.external_id);
    account.set("source", "sync");
    // Only the first time: after that these are the person's (Accounts' Edit).
    account.set("name", row.name);
    account.set("kind", row.kind);
    if (row.last4) account.set("last4", row.last4);
  }
  account.set("link", link.id);
  if (row.institution && !account.getString("institution"))
    account.set("institution", row.institution);
  account.set("currency", row.currency);
  if (row.balance_cents !== null) {
    account.set("balance_cents", row.balance_cents);
    account.set("balance_date", row.balance_date);
  }
  txApp.save(account);
  return account;
}

/**
 * The row a statement imported into `account` already holds for `t`, as
 * shared/overlap.ts matches them (lib/gen/overlap.js), or null. Rows a sync took over are the
 * link's now, so each imported row stands for one transaction at most.
 */
function imported(txApp, account, t) {
  var span = overlap.around(t.posted);
  var rows = txApp.findRecordsByFilter(
    "transactions",
    "account = {:account} && source = 'import' && amount_cents = {:amount} && posted >= {:from} && posted <= {:to}",
    "posted",
    0,
    0,
    {
      account: account.id,
      amount: t.amount_cents,
      from: span.from,
      to: span.to,
    },
  );
  var i = overlap.nearest(
    t,
    rows.map(function (r) {
      return {
        posted: r.getString("posted"),
        amount_cents: r.getInt("amount_cents"),
      };
    }),
  );
  return i === -1 ? null : rows[i];
}

/**
 * A pending charge that posts comes back as a new transaction (and the
 * pending one is removed): what the person made of the pending one, its
 * name, note, being left out, a category chosen by hand and a split, moves
 * to the posted one. A split whose amount changed as it posted (a tip) is
 * left to fix (shared/splits.ts).
 */
function carryOver(txApp, account, t, rec) {
  if (!t.pending_of) return;
  var was;
  try {
    was = txApp.findFirstRecordByFilter(
      "transactions",
      "account = {:account} && external_id = {:ext}",
      { account: account.id, ext: t.pending_of },
    );
  } catch (_) {
    return;
  }
  if (was.getString("payee")) rec.set("payee", was.getString("payee"));
  rec.set("note", was.getString("note"));
  rec.set("excluded", was.getBool("excluded"));
  rec.set("reviewed", was.getBool("reviewed"));
  if (was.getString("category_by") === "person") {
    rec.set("category", was.getString("category"));
    rec.set("category_by", "person");
  }
  var parts = JSON.parse(was.getString("splits") || "null");
  if (parts) rec.set("splits", parts);
}

/**
 * Adds or brings up to date one transaction, or takes over the row a
 * statement already brought in for it; answers "added", "updated" or "".
 * A new one posted long before the link was made (`linkedAt`) is the link's
 * history, kept out of the review inbox (shared/review.ts).
 */
function upsert(txApp, collection, account, t, linkedAt) {
  var rec;
  try {
    rec = txApp.findFirstRecordByFilter(
      "transactions",
      "account = {:account} && external_id = {:ext}",
      { account: account.id, ext: t.external_id },
    );
  } catch (_) {
    rec = null;
  }
  var outcome = "updated";
  var took = !rec && imported(txApp, account, t);
  if (took) {
    // The statement had it first: the row becomes the link's, so the bank's
    // later changes and removals reach it, and undoing that import keeps it.
    rec = took;
    rec.set("source", "sync");
    rec.set("external_id", t.external_id);
    rec.set("import", "");
    if (!rec.getString("payee")) rec.set("payee", t.payee);
  } else if (rec) {
    if (
      rec.getString("posted") === t.posted &&
      rec.getInt("amount_cents") === t.amount_cents &&
      rec.getBool("pending") === t.pending &&
      rec.getString("description") === t.description &&
      rec.getString("bank_category") === t.bank_category
    )
      return "";
  } else {
    rec = new Record(collection);
    rec.set("owner", account.getString("owner"));
    rec.set("account", account.id);
    rec.set("source", "sync");
    rec.set("external_id", t.external_id);
    // The bank's own words; the person's edits to these later stay theirs.
    rec.set("payee", t.payee);
    rec.set("history", review.isHistory(t.posted, linkedAt));
    carryOver(txApp, account, t, rec);
    outcome = "added";
  }
  rec.set("posted", t.posted);
  rec.set("amount_cents", t.amount_cents);
  rec.set("description", t.description);
  rec.set("pending", t.pending);
  // Plaid's category; pb_hooks/categories.pb.js sorts the row by it as it saves.
  rec.set("bank_category", t.bank_category);
  txApp.save(rec);
  return outcome;
}

module.exports = {
  accountFor: accountFor,
  upsert: upsert,
  carryOver: carryOver,
};
