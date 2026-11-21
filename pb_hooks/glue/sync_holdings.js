/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Investment holdings from a bank-link sync (PLAID_INVESTMENTS): written only
// here, after glue/bank_links.js has synced the link's accounts. Required
// inside a handler body, like every glue module.
// ---------------------------------------------------------------------------

var dates = require(`${__hooks}/lib/dates.js`);
var investing = require(`${__hooks}/lib/gen/investing.js`);
var ProviderError = require(`${__hooks}/glue/providers.js`).ProviderError;

/**
 * What the link's brokerage and retirement accounts hold, when the provider
 * gives holdings and they're switched on (PLAID_INVESTMENTS): each such
 * account's rows are replaced with what the bank says now, today's
 * `holding_history` row per security is written (or rewritten, on a second
 * sync the same day), and the link notes why there are none
 * ("unsupported", "consent"). Then the accounts' activity (syncActivity).
 * Best effort: a failed call keeps what was there and never fails the sync.
 * `today` is the person's day (YYYY-MM-DD).
 */
function syncHoldings(app, link, provider, access, rows, today) {
  if (!provider.holdings || !provider.holdingsOn || !provider.holdingsOn()) return;
  var invested = rows.filter(function (r) {
    return r.kind === "brokerage" || r.kind === "retirement";
  });
  if (!invested.length) return;
  var got;
  try {
    got = provider.holdings(access);
  } catch (err) {
    if (err instanceof ProviderError) return;
    throw err;
  }
  var owner = link.getString("owner");
  var now = dates.toPb(Date.now());
  app.runInTransaction(function (txApp) {
    if (got.status === "ok") {
      var collection = txApp.findCollectionByNameOrId("holdings");
      invested.forEach(function (r) {
        var account;
        try {
          account = txApp.findFirstRecordByFilter("accounts", "owner = {:owner} && external_id = {:ext}", { owner: owner, ext: r.external_id });
        } catch (_) {
          return;
        }
        txApp.findRecordsByFilter("holdings", "account = {:a}", "", 0, 0, { a: account.id }).forEach(function (h) {
          txApp.delete(h);
        });
        var mine = got.rows.filter(function (h) {
          return h.account === r.external_id;
        });
        keepDay(txApp, owner, account.id, today, mine);
        mine
          .forEach(function (h) {
            var rec = new Record(collection);
            rec.set("owner", owner);
            rec.set("account", account.id);
            ["name", "ticker", "type", "quantity", "price_cents", "value_cents", "cost_basis_cents", "currency", "price_as_of"].forEach(function (f) {
              if (h[f] !== null && h[f] !== undefined) rec.set(f, h[f]);
            });
            rec.set("as_of", now);
            txApp.save(rec);
          });
      });
    }
    var fresh = txApp.findRecordById("bank_links", link.id);
    fresh.set("holdings", got.status);
    txApp.save(fresh);
  });
  if (got.status === "ok" && provider.activity) {
    try {
      syncActivity(app, owner, provider, access, invested, today);
    } catch (err) {
      if (!(err instanceof ProviderError)) console.log("[holdings] activity for link " + link.id + ": " + err);
    }
  }
}

/** The account's row per security for `today` in holding_history, replacing any written earlier that day. */
function keepDay(txApp, owner, account, today, positions) {
  txApp
    .findRecordsByFilter("holding_history", "account = {:a} && date = {:d}", "", 0, 0, { a: account, d: today })
    .forEach(function (h) {
      txApp.delete(h);
    });
  var collection = txApp.findCollectionByNameOrId("holding_history");
  investing.dayRows(positions).forEach(function (d) {
    var rec = new Record(collection);
    rec.set("owner", owner);
    rec.set("account", account);
    rec.set("date", today);
    ["security", "name", "ticker", "type", "quantity", "value_cents"].forEach(function (f) {
      rec.set(f, d[f]);
    });
    if (d.price_cents !== null) rec.set("price_cents", d.price_cents);
    txApp.save(rec);
  });
}

/**
 * The investment accounts' buys, sells, dividends and the rest, kept in
 * `investment_activity`: from a month before the newest kept (two years
 * back the first time, or when some was read an older way) to today, each
 * added once by its id, or updated.
 */
function syncActivity(app, owner, provider, access, invested, today) {
  var accounts = {};
  invested.forEach(function (r) {
    try {
      accounts[r.external_id] = app.findFirstRecordByFilter("accounts", "owner = {:owner} && external_id = {:ext}", { owner: owner, ext: r.external_id }).id;
    } catch (_) {
      /* not kept */
    }
  });
  var ids = Object.keys(accounts).map(function (k) {
    return accounts[k];
  });
  if (!ids.length) return;
  var newest = "";
  var stale = false;
  var first = investing.activityFrom("", today);
  ids.forEach(function (id) {
    var last = app.findRecordsByFilter("investment_activity", "account = {:a}", "-date", 1, 0, { a: id })[0];
    if (last && last.getString("date") > newest) newest = last.getString("date");
    // Rows read an older way (ACTIVITY_READING) are asked for again, all of them, and read anew.
    if (!stale) {
      stale = app.findRecordsByFilter("investment_activity", "account = {:a} && reading < {:r} && date >= {:from}", "", 1, 0, { a: id, r: investing.ACTIVITY_READING, from: first }).length > 0;
    }
  });
  var got = provider.activity(access, investing.activityFrom(newest, today, stale), today);
  if (got.status !== "ok") return;
  app.runInTransaction(function (txApp) {
    var collection = txApp.findCollectionByNameOrId("investment_activity");
    got.rows.forEach(function (a) {
      var account = accounts[a.account];
      if (!account) return;
      var rec;
      try {
        rec = txApp.findFirstRecordByFilter("investment_activity", "account = {:a} && external_id = {:id}", { a: account, id: a.id });
      } catch (_) {
        rec = new Record(collection);
        rec.set("owner", owner);
        rec.set("account", account);
        rec.set("external_id", a.id);
      }
      ["date", "kind", "name", "security", "ticker", "quantity", "amount_cents"].forEach(function (f) {
        rec.set(f, a[f]);
      });
      rec.set("security_type", a.security_type || "");
      rec.set("reading", investing.ACTIVITY_READING);
      rec.set("price_cents", a.price_cents === null ? 0 : a.price_cents);
      rec.set("fees_cents", a.fees_cents === null ? 0 : a.fees_cents);
      txApp.save(rec);
    });
  });
}

module.exports = { syncHoldings: syncHoldings };
