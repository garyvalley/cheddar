/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/categories.js applied to records. Required inside a handler body, not
// at file scope (glue/plaid.js says why).
// ---------------------------------------------------------------------------

var cats = require(`${__hooks}/lib/categories.js`);
var splits = require(`${__hooks}/lib/splits.js`);

/** The person's custom category with this id ("c-..."), or null. */
function customOf(app, owner, id) {
  if (!cats.isCustomId(id)) return null;
  try {
    var rec = app.findRecordById("custom_categories", id.slice(2));
    return rec.getString("owner") === owner ? rec : null;
  } catch (_) {
    return null;
  }
}

/** Whether `id` is a category this person can use: built in, or one of theirs. */
function usable(app, owner, id) {
  return cats.isCategory(id) || !!customOf(app, owner, id);
}

/** The person's own category for a merchant, or "". */
function ruleFor(app, owner, merchant) {
  if (!merchant) return "";
  try {
    var id = app
      .findFirstRecordByFilter(
        "category_rules",
        "owner = {:owner} && merchant = {:merchant}",
        { owner: owner, merchant: merchant },
      )
      .getString("category");
    return usable(app, owner, id) ? id : "";
  } catch (_) {
    return "";
  }
}

function isLiability(app, accountId) {
  try {
    var kind = app.findRecordById("accounts", accountId).getString("kind");
    return kind === "credit_card" || kind === "loan";
  } catch (_) {
    return false;
  }
}

/**
 * Sets a transaction's merchant and, unless the person chose it by hand,
 * its category. Doesn't save: the hooks call it as the record saves.
 */
function sort(app, rec) {
  var merchant = cats.merchantKey(
    rec.getString("payee"),
    rec.getString("description"),
  );
  rec.set("merchant_key", merchant);
  if (
    rec.getString("category_by") === "person" &&
    usable(app, rec.getString("owner"), rec.getString("category"))
  )
    return;
  var r = cats.categorize(
    {
      amount_cents: rec.getInt("amount_cents"),
      description: rec.getString("description"),
      payee: rec.getString("payee"),
      bank_category: rec.getString("bank_category"),
      liability: isLiability(app, rec.getString("account")),
    },
    ruleFor(app, rec.getString("owner"), merchant),
  );
  rec.set("category", r.category);
  rec.set("category_by", r.by);
}

/**
 * The person moves a transaction to `category`: it stays there, their rule
 * for its merchant becomes that category, and every other transaction of
 * the merchant's that they haven't moved by hand follows. Answers how many
 * others moved.
 */
function recategorize(app, rec, category) {
  var moved = 0;
  app.runInTransaction(function (txApp) {
    rec.set("category", category);
    rec.set("category_by", "person");
    txApp.save(rec);
    var owner = rec.getString("owner");
    var merchant = rec.getString("merchant_key");
    if (!merchant) return;
    var rule;
    try {
      rule = txApp.findFirstRecordByFilter(
        "category_rules",
        "owner = {:owner} && merchant = {:merchant}",
        { owner: owner, merchant: merchant },
      );
    } catch (_) {
      rule = new Record(txApp.findCollectionByNameOrId("category_rules"));
      rule.set("owner", owner);
      rule.set("merchant", merchant);
    }
    rule.set("category", category);
    txApp.save(rule);
    txApp
      .findRecordsByFilter(
        "transactions",
        "owner = {:owner} && merchant_key = {:merchant} && category_by != 'person' && id != {:id}",
        "",
        0,
        0,
        { owner: owner, merchant: merchant, id: rec.id },
      )
      .forEach(function (other) {
        if (other.getString("category") !== category) moved++;
        // Saving sorts it again, and the rule just saved now wins.
        txApp.save(other);
      });
  });
  return moved;
}

/** The person's categories: { id, label, spending, custom }, built in first, then theirs by name. */
function list(app, owner) {
  var custom = app.findRecordsByFilter(
    "custom_categories",
    "owner = {:owner}",
    "name",
    0,
    0,
    { owner: owner },
  );
  return cats.CATEGORIES.map(function (c) {
    return { id: c.id, label: c.label, spending: c.spending, custom: false };
  }).concat(
    custom.map(function (r) {
      return {
        id: "c-" + r.id,
        label: r.getString("name"),
        spending: true,
        custom: true,
      };
    }),
  );
}

/** The caller's categories plus names for custom categories on accounts shared with them. */
function visibleList(app, owner) {
  var visible = list(app, owner);
  var owners = {};
  app
    .findRecordsByFilter(
      "accounts",
      "shared_household.members.id ?= {:user}",
      "",
      0,
      0,
      { user: owner },
    )
    .forEach(function (account) {
      var accountOwner = account.getString("owner");
      if (accountOwner && accountOwner !== owner) owners[accountOwner] = true;
    });
  Object.keys(owners).forEach(function (accountOwner) {
    app
      .findRecordsByFilter(
        "custom_categories",
        "owner = {:owner}",
        "name",
        0,
        0,
        { owner: accountOwner },
      )
      .forEach(function (record) {
        visible.push({
          id: "c-" + record.id,
          label: record.getString("name"),
          spending: true,
          custom: true,
          shared: true,
        });
      });
  });
  return visible;
}

/** Whether the person already has a category by this name (built in or theirs), other than `except`. */
function nameTaken(app, owner, name, except) {
  var n = name.toLowerCase();
  return list(app, owner).some(function (c) {
    return c.id !== except && c.label.toLowerCase() === n;
  });
}

/**
 * Deletes a custom category. Rules for it go, and its transactions are
 * sorted again on their own, as if it had never been chosen; parts of a
 * split in it move to Other. Answers how many transactions were in it.
 */
function remove(app, owner, custom) {
  var id = "c-" + custom.id;
  var count = 0;
  app.runInTransaction(function (txApp) {
    txApp
      .findRecordsByFilter(
        "category_rules",
        "owner = {:owner} && category = {:id}",
        "",
        0,
        0,
        { owner: owner, id: id },
      )
      .forEach(function (r) {
        txApp.delete(r);
      });
    txApp.delete(custom);
    txApp
      .findRecordsByFilter(
        "transactions",
        "owner = {:owner} && category = {:id}",
        "",
        0,
        0,
        { owner: owner, id: id },
      )
      .forEach(function (t) {
        t.set("category", "");
        t.set("category_by", "");
        txApp.save(t);
        count++;
      });
    // Split parts in it go to Other, where its sorted-again transactions may land too.
    txApp
      .findRecordsByFilter(
        "transactions",
        "owner = {:owner} && splits ~ {:part}",
        "",
        0,
        0,
        { owner: owner, part: '"category":"' + id + '"' },
      )
      .forEach(function (t) {
        t.set(
          "splits",
          splits.moveParts(JSON.parse(t.getString("splits")), id, "other"),
        );
        txApp.save(t);
      });
  });
  return count;
}

module.exports = {
  sort: sort,
  recategorize: recategorize,
  customOf: customOf,
  usable: usable,
  list: list,
  visibleList: visibleList,
  nameTaken: nameTaken,
  remove: remove,
};
