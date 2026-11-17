/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Matching transfers and refunds (glue/links.js, shared/links.ts). Only
// these hooks write `link`, `link_kind`, `link_checked` and `link_off`: the
// record API's writes to them are dropped.
//
//   POST /api/transactions/{id}/unlink -> { unlinked }
//     The person says a match is wrong: both rows are on their own, and
//     neither is matched again.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth())
    ["link", "link_kind", "link_checked", "link_off"].forEach(function (f) {
      e.record.set(f, f === "link_checked" || f === "link_off" ? false : "");
    });
  e.next();
}, "transactions");

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var original = e.record.original();
    ["link", "link_kind", "link_checked", "link_off"].forEach(function (f) {
      e.record.set(f, original.get(f));
    });
  }
  e.next();
}, "transactions");

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/glue/links.js`).check(e.app, e.record);
  } catch (err) {
    console.log("[links] couldn't match " + e.record.id + ": " + err);
  }
  e.next();
}, "transactions");

onRecordAfterDeleteSuccess((e) => {
  try {
    require(`${__hooks}/glue/links.js`).released(e.app, e.record);
  } catch (err) {
    console.log("[links] couldn't release " + e.record.id + ": " + err);
  }
  e.next();
}, "transactions");

routerAdd(
  "POST",
  "/api/transactions/{id}/unlink",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var rec = null;
    try {
      rec = e.app.findRecordById("transactions", e.request.pathValue("id"));
    } catch (_) {
      /* the same answer as someone else's */
    }
    if (!rec || rec.getString("owner") !== e.auth.id)
      throw new NotFoundError("That transaction isn't there.");
    return e.json(200, { unlinked: require(`${__hooks}/glue/links.js`).unlink(e.app, rec) });
  },
  $apis.requireAuth("users"),
);

// Transactions saved before matching existed: a few thousand at a time,
// oldest first, until every one has been tried.
cronAdd("links_backfill", "*/5 * * * *", () => {
  var glue = require(`${__hooks}/glue/links.js`);
  var rows;
  try {
    rows = $app.findRecordsByFilter("transactions", "link_checked = false", "posted", 2000, 0);
  } catch (err) {
    console.log("[links] backfill skipped: " + err);
    return;
  }
  var linked = 0;
  rows.forEach(function (rec) {
    try {
      if (glue.check($app, rec)) linked++;
    } catch (err) {
      console.log("[links] couldn't match " + rec.id + ": " + err);
    }
  });
  if (rows.length) console.log("[links] tried " + rows.length + ", linked " + linked);
});
