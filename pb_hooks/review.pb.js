/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// A transaction's `history` flag: set only by a bank sync, on the rows that
// came with a new link's history (glue/bank_links.js, shared/review.ts), and
// kept out of Spending's review inbox. The record API's writes to it are
// dropped, as categories.pb.js drops the category's.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("history", false);
  e.next();
}, "transactions");

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth())
    e.record.set("history", e.record.original().getBool("history"));
  e.next();
}, "transactions");
