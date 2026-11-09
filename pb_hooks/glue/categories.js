/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/categories.js applied to records. Required inside a handler body, not
// at file scope (glue/plaid.js says why).
// ---------------------------------------------------------------------------

var cats = require(`${__hooks}/lib/categories.js`)

/** The person's own category for a merchant, or "". */
function ruleFor(app, owner, merchant) {
  if (!merchant) return ""
  try {
    return app.findFirstRecordByFilter("category_rules", "owner = {:owner} && merchant = {:merchant}", { owner: owner, merchant: merchant }).getString("category")
  }
  catch (_) {
    return ""
  }
}

function isLiability(app, accountId) {
  try {
    var kind = app.findRecordById("accounts", accountId).getString("kind")
    return kind === "credit_card" || kind === "loan"
  }
  catch (_) {
    return false
  }
}

/**
 * Sets a transaction's merchant and, unless the person chose it by hand,
 * its category. Doesn't save: the hooks call it as the record saves.
 */
function sort(app, rec) {
  var merchant = cats.merchantKey(rec.getString("payee"), rec.getString("description"))
  rec.set("merchant_key", merchant)
  if (rec.getString("category_by") === "person" && cats.isCategory(rec.getString("category"))) return
  var r = cats.categorize({
    amount_cents: rec.getInt("amount_cents"),
    description: rec.getString("description"),
    payee: rec.getString("payee"),
    bank_category: rec.getString("bank_category"),
    liability: isLiability(app, rec.getString("account")),
  }, ruleFor(app, rec.getString("owner"), merchant))
  rec.set("category", r.category)
  rec.set("category_by", r.by)
}

/**
 * The person moves a transaction to `category`: it stays there, their rule
 * for its merchant becomes that category, and every other transaction of
 * the merchant's that they haven't moved by hand follows. Answers how many
 * others moved.
 */
function recategorize(app, rec, category) {
  var moved = 0
  app.runInTransaction(function (txApp) {
    rec.set("category", category)
    rec.set("category_by", "person")
    txApp.save(rec)
    var owner = rec.getString("owner")
    var merchant = rec.getString("merchant_key")
    if (!merchant) return
    var rule
    try {
      rule = txApp.findFirstRecordByFilter("category_rules", "owner = {:owner} && merchant = {:merchant}", { owner: owner, merchant: merchant })
    }
    catch (_) {
      rule = new Record(txApp.findCollectionByNameOrId("category_rules"))
      rule.set("owner", owner)
      rule.set("merchant", merchant)
    }
    rule.set("category", category)
    txApp.save(rule)
    txApp.findRecordsByFilter("transactions", "owner = {:owner} && merchant_key = {:merchant} && category_by != 'person' && id != {:id}", "", 0, 0,
      { owner: owner, merchant: merchant, id: rec.id }).forEach(function (other) {
      if (other.getString("category") !== category) moved++
      // Saving sorts it again, and the rule just saved now wins.
      txApp.save(other)
    })
  })
  return moved
}

module.exports = { sort: sort, recategorize: recategorize }
