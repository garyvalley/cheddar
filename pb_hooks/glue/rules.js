/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Settings → Rules (pb_hooks/rules.pb.js): the rules a person writes
// (`transaction_rules`, shared/rules.ts) and the merchant rules Cheddar
// learned when they moved a transaction (`category_rules`). Saving a
// transaction applies both (glue/categories.js sort()); this lists, changes
// and removes them, and sorts again what a change touches. Required inside a
// handler body, not at file scope (glue/bank_links.js says why).
// ---------------------------------------------------------------------------

var shared = require(`${__hooks}/lib/gen/rules.js`);
var glue = require(`${__hooks}/glue/categories.js`);

function merchantOf(r) {
  return {
    id: r.id,
    merchant: r.getString("merchant"),
    category: r.getString("category"),
  };
}

/** Every rule the person has: { rules, merchant }. */
function list(app, owner) {
  return {
    rules: glue.rulesOf(app, owner),
    merchant: app
      .findRecordsByFilter(
        "category_rules",
        "owner = {:owner}",
        "merchant",
        0,
        0,
        { owner: owner },
      )
      .map(merchantOf),
  };
}

function own(app, collection, owner, id) {
  try {
    var rec = app.findRecordById(collection, id);
    return rec.getString("owner") === owner ? rec : null;
  } catch (_) {
    return null;
  }
}

/** Saves every transaction of the person's that `filter` finds, so each is sorted again. Answers how many changed category. */
function resort(app, owner, filter, params) {
  var moved = 0;
  params.owner = owner;
  app
    .findRecordsByFilter(
      "transactions",
      "owner = {:owner} && (" + filter + ")",
      "",
      0,
      0,
      params,
    )
    .forEach(function (t) {
      var was = t.getString("category");
      app.save(t);
      if (t.getString("category") !== was) moved++;
    });
  return moved;
}

/**
 * Applies a rule to the person's transactions already there: a new name
 * and leave-out where it has them, and its category through sorting again
 * (a category picked by hand stays). Answers how many changed.
 */
function applyToPast(app, owner, rule) {
  var changed = 0;
  var filter = "owner = {:owner}";
  var params = { owner: owner };
  if (rule.account) {
    filter += " && account = {:account}";
    params.account = rule.account;
  }
  app
    .findRecordsByFilter("transactions", filter, "", 0, 0, params)
    .forEach(function (t) {
      var target = {
        description: t.getString("description"),
        payee: t.getString("payee"),
        amount_cents: t.getInt("amount_cents"),
        account: t.getString("account"),
      };
      if (!shared.matches(rule, target)) return;
      var before = [
        t.getString("category"),
        t.getString("payee"),
        t.getBool("excluded"),
      ].join("|");
      if (rule.rename) t.set("payee", rule.rename);
      if (rule.exclude) t.set("excluded", true);
      app.save(t);
      var after = [
        t.getString("category"),
        t.getString("payee"),
        t.getBool("excluded"),
      ].join("|");
      if (after !== before) changed++;
    });
  return changed;
}

/**
 * Adds a rule (id "") or changes one of the person's. `input` is the form's
 * (shared/rules.ts checkRule); with `apply` it's applied to past
 * transactions too. Answers { rule, applied }, or { problem } in words.
 */
function save(app, owner, id, input, apply) {
  var checked = shared.checkRule(input);
  if (checked.problem) return { problem: checked.problem };
  var fields = checked.rule;
  if (fields.account) {
    var acct = own(app, "accounts", owner, fields.account);
    if (!acct) return { problem: "Choose one of your accounts." };
  }
  if (fields.category && !glue.usable(app, owner, fields.category))
    return { problem: "Choose one of the categories." };
  var rec;
  if (id) {
    rec = own(app, "transaction_rules", owner, id);
    if (!rec) return { missing: true };
  } else {
    if (
      app.countRecords("transaction_rules", $dbx.hashExp({ owner: owner })) >=
      shared.RULES_MAX
    )
      return {
        problem:
          "That's as many rules as one account can have. Delete one first.",
      };
    rec = new Record(app.findCollectionByNameOrId("transaction_rules"));
    rec.set("owner", owner);
  }
  var applied = 0;
  app.runInTransaction(function (txApp) {
    rec.set("text", fields.text);
    rec.set("min_cents", fields.min_cents);
    rec.set("max_cents", fields.max_cents);
    rec.set("account", fields.account);
    rec.set("category", fields.category);
    rec.set("rename", fields.rename);
    rec.set("exclude", fields.exclude);
    txApp.save(rec);
    // What the rule sorted before may not match it now.
    if (id) resort(txApp, owner, "category_by = 'rule'", {});
    if (apply) applied = applyToPast(txApp, owner, glue.ruleOf(rec));
  });
  return { rule: glue.ruleOf(rec), applied: applied };
}

/** Deletes one of the person's rules; what it sorted is sorted again without it. Answers { resorted } or null. */
function remove(app, owner, id) {
  var rec = own(app, "transaction_rules", owner, id);
  if (!rec) return null;
  var resorted = 0;
  app.runInTransaction(function (txApp) {
    txApp.delete(rec);
    resorted = resort(txApp, owner, "category_by = 'rule'", {});
  });
  return { resorted: resorted };
}

/** Changes the category a learned merchant rule sends its transactions to. Answers { rule, moved }, { problem } or null. */
function setMerchant(app, owner, id, category) {
  var rec = own(app, "category_rules", owner, id);
  if (!rec) return null;
  if (!glue.usable(app, owner, category))
    return { problem: "Choose one of the categories." };
  var moved = 0;
  app.runInTransaction(function (txApp) {
    rec.set("category", category);
    txApp.save(rec);
    moved = resort(
      txApp,
      owner,
      "merchant_key = {:merchant} && category_by != 'person'",
      { merchant: rec.getString("merchant") },
    );
  });
  return { rule: merchantOf(rec), moved: moved };
}

/** Forgets a learned merchant rule: its transactions are sorted again on their own. Answers { resorted } or null. */
function removeMerchant(app, owner, id) {
  var rec = own(app, "category_rules", owner, id);
  if (!rec) return null;
  var resorted = 0;
  app.runInTransaction(function (txApp) {
    txApp.delete(rec);
    resorted = resort(
      txApp,
      owner,
      "merchant_key = {:merchant} && category_by = 'rule'",
      { merchant: rec.getString("merchant") },
    );
  });
  return { resorted: resorted };
}

/** POST /api/rules and /api/rules/{id}: the form's rule saved, as the route answers. */
function saveRoute(e, id) {
  if (!e.auth.getBool("mfa_enabled"))
    throw new ForbiddenError("Turn on two-step sign-in first.");
  var body = e.requestInfo().body || {};
  var r = save(e.app, e.auth.id, id, body, body.apply === true);
  if (r.missing) throw new NotFoundError("That rule isn't there.");
  if (r.problem) throw new BadRequestError(r.problem);
  return e.json(200, r);
}

module.exports = {
  saveRoute: saveRoute,
  list: list,
  save: save,
  remove: remove,
  setMerchant: setMerchant,
  removeMerchant: removeMerchant,
};
