/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Each account's balance over time (migrations/0010_balance_history.mjs):
// whenever an account is saved with a balance -- a bank sync, or a person
// entering one on Accounts -- that day's row in `balance_history` is made or
// brought up to date (glue/balances.js). Only this hook writes the collection.
// ---------------------------------------------------------------------------

onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/glue/balances.js`).record(e.app, e.record)
  e.next()
}, "accounts")

onRecordAfterUpdateSuccess((e) => {
  require(`${__hooks}/glue/balances.js`).record(e.app, e.record)
  e.next()
}, "accounts")
