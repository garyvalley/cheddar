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

module.exports = { record: record }
