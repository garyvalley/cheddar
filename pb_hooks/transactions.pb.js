/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Every hook on a transaction's create and update, one of each. A hook of
// PocketBase's JS costs about half a millisecond a call, whatever it does:
// with one hook per concern a 4,000-row statement took most of a minute to
// import. A new step for transactions goes into one of these, not a hook of
// its own.
//
//   - Record API requests: what a person may write (glue/transaction_guards.js).
//   - Every save: sorted into a category (glue/categories.js sort()).
//   - Every new row: tried once for a transfer or refund it matches
//     (glue/links.js), inside the same write, so a big import pays for no
//     second save of each row.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) require(`${__hooks}/glue/transaction_guards.js`).create(e.record);
  e.next();
}, "transactions");

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) require(`${__hooks}/glue/transaction_guards.js`).update(e.app, e.record);
  e.next();
}, "transactions");

onRecordCreate((e) => {
  var categories = require(`${__hooks}/glue/categories.js`);
  var links = require(`${__hooks}/glue/links.js`);
  categories.sort(e.app, e.record, true);
  var match;
  try {
    match = links.matchNew(e.app, e.record);
    // A transfer is sorted as Transfers, a refund into its purchase's category.
    if (match) categories.sort(e.app, e.record, false);
  } catch (err) {
    // Left untried: the backfill (links.pb.js) tries it again.
    console.log("[links] couldn't match a new transaction: " + err);
    e.record.set("link", "");
    e.record.set("link_kind", "");
    e.record.set("link_checked", false);
    categories.sort(e.app, e.record, false);
    match = null;
  }
  e.next();
  if (!match) return;
  try {
    links.linkBack(e.app, e.record, match);
  } catch (err) {
    console.log("[links] couldn't link " + e.record.id + " back: " + err);
    e.record.set("link", "");
    e.record.set("link_kind", "");
    e.record.set("link_checked", false);
    e.app.save(e.record);
  }
}, "transactions");

onRecordUpdate((e) => {
  // glue/links.js check() saves a row again only to mark it tried: nothing
  // sort() reads has moved, so it isn't sorted twice.
  var categories = require(`${__hooks}/glue/categories.js`);
  if (!categories.onlyMarkedTried(e.record)) categories.sort(e.app, e.record, false);
  e.next();
}, "transactions");
