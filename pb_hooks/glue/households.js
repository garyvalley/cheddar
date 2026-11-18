/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// What a household member shares stops being shared when they leave it or
// are removed, and everything shared with it when it closes: their
// accounts (shared_household) and budgets (household). Required inside a
// handler body (glue/bank_links.js says why).
// ---------------------------------------------------------------------------

/** Stops `owner`'s sharing with `household`; with no owner, everyone's. */
function unshare(app, household, owner) {
  var only = owner ? " && owner = {:owner}" : ""
  app.findRecordsByFilter("accounts", "shared_household = {:household}" + only, "", 0, 0, { household: household, owner: owner || "" })
    .forEach(function (account) {
      account.set("shared_household", "")
      app.save(account)
    })
  app.findRecordsByFilter("budgets", "household = {:household}" + only, "", 0, 0, { household: household, owner: owner || "" })
    .forEach(function (budget) {
      budget.set("household", "")
      app.save(budget)
    })
}

module.exports = { unshare: unshare }
