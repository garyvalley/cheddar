/// <reference path="../../pb_data/types.d.ts" />

// What pb_hooks/balances.pb.js does when an account is saved: keeps the day's
// row of its balance in `balance_history` (migrations/0010_balance_history.mjs).

/** Makes or brings up to date the account's row for its balance's day; nothing without a balance. */
function record(app, account) {
  var date = account.getString("balance_date")
  if (!date) return
  var row
  try {
    row = app.findFirstRecordByFilter("balance_history", "account = {:account} && date = {:date}", { account: account.id, date: date })
  }
  catch (_) {
    row = new Record(app.findCollectionByNameOrId("balance_history"))
    row.set("owner", account.getString("owner"))
    row.set("account", account.id)
    row.set("date", date)
  }
  var cents = account.getInt("balance_cents")
  if (!row.isNew() && row.getInt("balance_cents") === cents) return
  row.set("balance_cents", cents)
  app.save(row)
}

// What a card or loan holds is owed, and kept negative (shared/accounts.ts isLiability).
var OWED = { credit_card: true, loan: true }

/** Turns every row of the account's balance history round. */
function flipHistory(app, accountId) {
  app.findRecordsByFilter("balance_history", "account = {:account}", "", 0, 0, { account: accountId }).forEach(function (row) {
    row.set("balance_cents", -row.getInt("balance_cents"))
    app.save(row)
  })
}

/**
 * Before an account is saved as another kind: when it moves between money
 * held and money owed (a card first made as "other"), what the person typed
 * stays and now counts the other way, so its balance and its history turn
 * round. Not for a linked account, whose bank says which way its balance
 * goes, nor for a balance saved in the same change, which was read as the
 * new kind. Answers whether the history was turned round.
 */
function rekind(app, account) {
  if (account.isNew() || account.getString("link")) return false
  var before = account.original()
  if (!OWED[before.getString("kind")] === !OWED[account.getString("kind")]) return false
  if (account.getInt("balance_cents") === before.getInt("balance_cents") && account.getString("balance_date") === before.getString("balance_date")) {
    account.set("balance_cents", -account.getInt("balance_cents"))
  }
  flipHistory(app, account.id)
  return true
}

module.exports = { record: record, rekind: rekind, flipHistory: flipHistory }
