/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// What the record API may write on a transaction, for everyone but a
// superuser. pb_hooks/transactions.pb.js runs each step below from its one
// create and one update request hook: a hook of PocketBase's JS costs about
// half a millisecond a call whatever it does, which for a few thousand rows
// was most of an import's time. Required inside a handler body, not at file
// scope (glue/bank_links.js says why).
//
// - Categories (categories.pb.js, glue/categories.js): only the hooks write
//   `category`, `category_by`, `merchant_key` and `bank_category`, so no
//   client can mark one as chosen by hand and no rule is overwritten unseen.
//   An import from another app (Mint, Monarch, YNAB: shared/app-exports.ts)
//   may say which of Cheddar's built-in categories it was in, as
//   "cheddar:<id>"; it's read as a bank's category is, so the person's own
//   rules still come first.
// - Transfers and refunds (links.pb.js, glue/links.js): only the hooks write
//   `link`, `link_kind`, `link_checked` and `link_off`.
// - Splits (shared/splits.ts, as lib/gen/splits.js): a new transaction starts
//   unsplit, and a change to the parts must add up to the amount, in the
//   person's own categories (checkStored()). Nuxt's PATCH
//   /api/transactions/:id writes them as the person. A bank sync and a
//   statement import never touch them, so a split outlasts every sync; a
//   change to the amount afterwards leaves it to be fixed, and the left-over
//   counts in the transaction's own category.
// - Tags (shared/tags.ts, as lib/gen/tags.js): checked and tidied
//   (checkTags()), written as the person by the owner or a member of the
//   household the account is shared with. A bank sync and a statement import
//   never touch them.
// - Review (shared/review.ts): `history` is set only by a bank sync, on the
//   rows that came with a new link's history (glue/sync_rows.js), and keeps
//   them out of Spending's review inbox.
// ---------------------------------------------------------------------------

var CATEGORY_FIELDS = ["category", "category_by", "merchant_key", "bank_category"];
var LINK_FIELDS = ["link", "link_kind", "link_checked", "link_off"];

/** A tags value as written: a list, or null for none. Throws on anything else. */
function parsedTags(raw) {
  try {
    return raw === "" || raw === "null" ? null : JSON.parse(raw);
  } catch (_) {
    throw new BadRequestError("Tags are a list of words.");
  }
}

function checkedTags(raw) {
  var r = require(`${__hooks}/lib/gen/tags.js`).checkTags(parsedTags(raw));
  if (r.problem) throw new BadRequestError(r.problem);
  return r.tags;
}

/** A new transaction from the record API, as the hooks allow it. */
function create(rec) {
  var from = rec.getString("bank_category");
  var keep = rec.getString("source") === "import" && /^cheddar:[a-z]{2,20}$/.test(from);
  CATEGORY_FIELDS.forEach(function (f) {
    rec.set(f, "");
  });
  if (keep) rec.set("bank_category", from);
  LINK_FIELDS.forEach(function (f) {
    rec.set(f, f === "link_checked" || f === "link_off" ? false : "");
  });
  rec.set("splits", null);
  rec.set("tags", checkedTags(rec.getString("tags")));
  rec.set("history", false);
}

/** A change to a transaction from the record API, as the hooks allow it. */
function update(app, rec) {
  var original = rec.original();
  CATEGORY_FIELDS.forEach(function (f) {
    rec.set(f, original.getString(f));
  });
  LINK_FIELDS.forEach(function (f) {
    rec.set(f, original.get(f));
  });
  rec.set("history", original.getBool("history"));

  var splits = rec.getString("splits");
  if (splits !== original.getString("splits")) {
    var usable = require(`${__hooks}/glue/categories.js`).usable;
    var owner = original.getString("owner");
    var value;
    try {
      value = JSON.parse(splits);
    } catch (_) {
      throw new BadRequestError("A split is a list of parts.");
    }
    var r = require(`${__hooks}/lib/gen/splits.js`).checkStored(value, rec.getInt("amount_cents"), function (id) {
      return usable(app, owner, id);
    });
    if (r.problem) throw new BadRequestError(r.problem);
    rec.set("splits", r.parts);
  }

  var tags = rec.getString("tags");
  if (tags !== original.getString("tags")) rec.set("tags", checkedTags(tags));
}

module.exports = { create: create, update: update };
