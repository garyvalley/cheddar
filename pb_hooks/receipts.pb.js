/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Receipts on transactions (shared/receipts.ts, migrations/0039). Nuxt adds
// them as the person through the record API, having checked the file; the
// collection's file field keeps to its size and kinds whatever adds one.
// Here they're counted: at most RECEIPTS_PER_TRANSACTION on a transaction,
// RECEIPTS_PER_PERSON in all.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var lib = require(`${__hooks}/lib/gen/receipts.js`)
    var on = e.app.countRecords("receipts", $dbx.hashExp({ transaction: e.record.getString("transaction") }))
    if (on >= lib.RECEIPTS_PER_TRANSACTION)
      throw new BadRequestError("A transaction can have at most " + lib.RECEIPTS_PER_TRANSACTION + " receipts.")
    var all = e.app.countRecords("receipts", $dbx.hashExp({ owner: e.record.getString("owner") }))
    if (all >= lib.RECEIPTS_PER_PERSON)
      throw new BadRequestError("You have " + lib.RECEIPTS_PER_PERSON + " receipts, the most Cheddar keeps. Delete some you no longer need first.")
    var r = lib.receiptName(e.record.getString("name"), e.record.getString("type"))
    e.record.set("name", r)
  }
  e.next()
}, "receipts")
