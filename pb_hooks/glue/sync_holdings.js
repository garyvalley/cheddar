/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Investment holdings from a bank-link sync (PLAID_INVESTMENTS): written only
// here, after glue/bank_links.js has synced the link's accounts. Required
// inside a handler body, like every glue module.
// ---------------------------------------------------------------------------

var dates = require(`${__hooks}/lib/dates.js`);
var ProviderError = require(`${__hooks}/glue/providers.js`).ProviderError;

/**
 * What the link's brokerage and retirement accounts hold, when the provider
 * gives holdings and they're switched on (PLAID_INVESTMENTS): each such
 * account's rows are replaced with what the bank says now, and the link
 * notes why there are none ("unsupported", "consent"). Best effort: a failed
 * holdings call keeps the last ones and never fails the sync.
 */
function syncHoldings(app, link, provider, access, rows) {
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
        got.rows
          .filter(function (h) {
            return h.account === r.external_id;
          })
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
}

module.exports = { syncHoldings: syncHoldings };
