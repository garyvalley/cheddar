/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Matching transfers and refunds (pb_hooks/links.pb.js, shared/links.ts).
// A transaction is tried once as it's created, and the backfill tries the
// ones saved before this ran. A match links both rows to each other and
// saves them, which sorts them again (glue/categories.js sort(): a transfer
// as Transfers, a refund into its purchase's category). Required inside a
// handler body, not at file scope (glue/bank_links.js says why).
// ---------------------------------------------------------------------------

var lib = require(`${__hooks}/lib/gen/links.js`);
var cats = require(`${__hooks}/lib/gen/categories.js`);

function rowOf(r) {
  return {
    id: r.id,
    owner: r.getString("owner"),
    account: r.getString("account"),
    posted: r.getString("posted").slice(0, 10),
    amount_cents: r.getInt("amount_cents"),
    merchant_key: r.getString("merchant_key"),
    category: r.getString("category"),
    category_by: r.getString("category_by"),
    pending: r.getBool("pending"),
    excluded: r.getBool("excluded"),
    link: r.getString("link"),
    link_off: r.getBool("link_off"),
  };
}

/** "YYYY-MM-DD" `n` days after `ymd` (before, when negative). */
function shift(ymd, n) {
  return new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** Whether a category counts as spending: every one but income and transfers. */
function spending(category) {
  if (!category) return false;
  var built = cats.CATEGORIES.filter(function (c) {
    return c.id === category;
  })[0];
  return built ? !!built.spending : category.indexOf("c-") === 0;
}

function find(app, filter, params) {
  return app.findRecordsByFilter("transactions", filter, "", 50, 0, params);
}

/** The row `rec` matches, and how, or null. */
function partnerOf(app, rec) {
  var row = rowOf(rec);
  if (!lib.matchable(row)) return null;
  var posted = row.posted;
  var near = find(
    app,
    "owner = {:owner} && account != {:account} && amount_cents = {:amount} && posted >= {:from} && posted <= {:to} && link = '' && link_off = false && pending = false && excluded = false",
    {
      owner: row.owner,
      account: row.account,
      amount: -row.amount_cents,
      from: shift(posted, -lib.TRANSFER_DAYS),
      to: shift(posted, lib.TRANSFER_DAYS) + " 23:59:59.999Z",
    },
  );
  var id = lib.transferFor(row, near.map(rowOf));
  if (id) return { rec: pick(near, id), kind: "transfer" };
  if (row.amount_cents <= 0 || !row.merchant_key) return null;
  var before = find(
    app,
    "owner = {:owner} && account = {:account} && merchant_key = {:merchant} && amount_cents < 0 && posted >= {:from} && posted <= {:to} && link = '' && link_off = false && pending = false && excluded = false",
    {
      owner: row.owner,
      account: row.account,
      merchant: row.merchant_key,
      from: shift(posted, -lib.REFUND_DAYS),
      to: posted + " 23:59:59.999Z",
    },
  );
  id = lib.refundFor(row, before.map(rowOf), spending);
  return id ? { rec: pick(before, id), kind: "refund" } : null;
}

function pick(list, id) {
  return list.filter(function (r) {
    return r.id === id;
  })[0];
}

/**
 * Tries to match `rec` (saved already), and marks it tried. Answers
 * whether it was linked.
 */
function check(app, rec) {
  var linked = false;
  app.runInTransaction(function (txApp) {
    var fresh = txApp.findRecordById("transactions", rec.id);
    if (fresh.getBool("link_checked")) return;
    var match = partnerOf(txApp, fresh);
    fresh.set("link_checked", true);
    if (match) {
      fresh.set("link", match.rec.id);
      fresh.set("link_kind", match.kind);
      match.rec.set("link", fresh.id);
      match.rec.set("link_kind", match.kind);
      match.rec.set("link_checked", true);
      // The purchase is sorted first, so its refund can follow its category.
      txApp.save(fresh.getInt("amount_cents") > 0 ? match.rec : fresh);
      txApp.save(fresh.getInt("amount_cents") > 0 ? fresh : match.rec);
      linked = true;
    } else {
      txApp.save(fresh);
    }
  });
  return linked;
}

/** Undoes a match from either side: neither is matched on its own again. Answers false when `rec` had none. */
function unlink(app, rec) {
  var other = rec.getString("link");
  if (!other && !rec.getString("link_kind")) return false;
  app.runInTransaction(function (txApp) {
    [rec.id, other].forEach(function (id) {
      if (!id) return;
      var r;
      try {
        r = txApp.findRecordById("transactions", id);
      } catch (_) {
        return;
      }
      r.set("link", "");
      r.set("link_kind", "");
      r.set("link_off", true);
      txApp.save(r);
    });
  });
  return true;
}

/** After `rec` is deleted: its partner is on its own again, and may be matched again. */
function released(app, rec) {
  var id = rec.getString("link");
  if (!id) return;
  try {
    var other = app.findRecordById("transactions", id);
    if (other.getString("link") && other.getString("link") !== rec.id) return;
    other.set("link", "");
    other.set("link_kind", "");
    other.set("link_checked", false);
    app.save(other);
  } catch (_) {
    /* gone too */
  }
}

/** The linked purchase's category, for a refund, or "". */
function refundCategory(app, rec) {
  if (rec.getString("link_kind") !== "refund" || rec.getInt("amount_cents") <= 0) return "";
  try {
    return app.findRecordById("transactions", rec.getString("link")).getString("category");
  } catch (_) {
    return "";
  }
}

module.exports = {
  check: check,
  unlink: unlink,
  released: released,
  refundCategory: refundCategory,
  spending: spending,
};
