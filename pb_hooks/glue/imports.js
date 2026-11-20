/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// A statement's rows written into the import that holds them (imports.pb.js).
// Required inside a handler body, not at file scope (glue/bank_links.js says
// why).
// ---------------------------------------------------------------------------

/** At most this many rows a request, each request one transaction, so the database is never held for long. */
var MAX_ROWS = 1000;

var DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A text field of a row, or "" when it isn't text. */
function text(v) {
  return typeof v === "string" ? v : "";
}

/**
 * Adds `rows` to the person's import `importId`, in its account: each as the
 * record API would have taken it from them (glue/transaction_guards.js), and
 * sorted and tried for a match as any new row is (transactions.pb.js). All or
 * none. Answers how many were added, or throws.
 */
function addRows(app, owner, importId, rows) {
  // The request body's lists are Go's: as plain JS values, for Array.isArray.
  rows = JSON.parse(JSON.stringify(rows === undefined ? null : rows));
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS)
    throw new BadRequestError("Send from 1 to " + MAX_ROWS + " rows at a time.");
  var imp = null;
  try {
    imp = app.findRecordById("imports", importId);
  } catch (_) {
    /* the same answer as someone else's */
  }
  if (!imp || imp.getString("owner") !== owner) throw new NotFoundError("That import isn't there.");
  var account = imp.getString("account");
  var acct = app.findRecordById("accounts", account);
  if (acct.getString("owner") !== owner) throw new NotFoundError("That import isn't there.");

  var tags = require(`${__hooks}/lib/gen/tags.js`);
  var collection = app.findCollectionByNameOrId("transactions");
  app.runInTransaction(function (txApp) {
    rows.forEach(function (row, i) {
      row = row || {};
      var posted = text(row.posted);
      var cents = row.amount_cents;
      if (!DATE.test(posted) || typeof cents !== "number" || cents % 1 !== 0 || !text(row.external_id))
        throw new BadRequestError("Row " + (i + 1) + " needs a date, a whole number of cents and an id.");
      var rec = new Record(collection);
      rec.set("owner", owner);
      rec.set("account", account);
      rec.set("import", importId);
      rec.set("source", "import");
      rec.set("external_id", text(row.external_id));
      rec.set("posted", posted);
      rec.set("amount_cents", cents);
      rec.set("description", text(row.description));
      // Another app's export (shared/app-exports.ts) brings its own; its
      // category is kept only as one of Cheddar's ids, read as a bank's is.
      if (text(row.payee)) rec.set("payee", text(row.payee));
      if (text(row.note)) rec.set("note", text(row.note));
      if (row.tags !== undefined && row.tags !== null) {
        var t = tags.checkTags(row.tags);
        if (t.problem) throw new BadRequestError(t.problem);
        rec.set("tags", t.tags);
      }
      var bank = text(row.bank_category);
      if (/^cheddar:[a-z]{2,20}$/.test(bank)) rec.set("bank_category", bank);
      txApp.save(rec);
    });
  });
  return rows.length;
}

module.exports = { addRows: addRows, MAX_ROWS: MAX_ROWS };
