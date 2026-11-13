/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Each account's balance over time (migrations/0010_balance_history.mjs):
// whenever an account is saved with a balance -- a bank sync, or a person
// entering one on Accounts -- that day's row in `balance_history` is made or
// brought up to date (glue/balances.js). Only this hook writes the collection.
// An account saved as a kind that moves between money held and money owed
// has its balance and history turned round first (glue/balances.js rekind).
// ---------------------------------------------------------------------------

onRecordUpdate((e) => {
  var balances = require(`${__hooks}/glue/balances.js`)
  var flipped = balances.rekind(e.app, e.record)
  try {
    e.next()
  }
  catch (err) {
    if (flipped) balances.flipHistory(e.app, e.record.id)
    throw err
  }
}, "accounts")

onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/glue/balances.js`).record(e.app, e.record)
  e.next()
}, "accounts")

onRecordAfterUpdateSuccess((e) => {
  require(`${__hooks}/glue/balances.js`).record(e.app, e.record)
  e.next()
}, "accounts")
