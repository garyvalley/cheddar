/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Bank-link providers. glue/bank_links.js links, syncs and removes through
// whichever provider a link names (`bank_links.provider`), so another
// aggregator (MX, Finicity, a bank's own open-banking API) is one more file
// in providers/ and one more line here, not a rewrite of the routes and the
// sync. Each provider answers in Cheddar's plain rows (lib/plaid.js's shapes)
// and throws ProviderError (providers/errors.js) when a call fails:
//
//   name                        what bank_links.provider holds
//   enabled()                   whether its settings are all there
//   limits()                    { perPerson, maxLinks }: new links stop there
//   linkToken(userId, access?)  what the page opens the provider's sign-in with
//   exchange(publicToken)       { access, itemId } once the person signed in
//   accounts(access, fallbackInstitution, today)
//                               { institution, rows: [{ external_id, name,
//                               institution, kind, last4, currency,
//                               balance_cents, balance_date }] }
//   changes(access, cursor)     { added, modified: [{ external_id, account,
//                               posted, amount_cents, description, payee,
//                               pending, bank_category, pending_of }],
//                               removed: [external_id], cursor }
//   remove(access)              tells the provider to forget the link
//   clean(text)                 a name from the provider made safe to show
//   MIN_SYNC_GAP_MS             a manual sync this soon answers the last one
//
// External ids carry the provider's prefix ("plaid:"), so they never match
// a statement file's or another provider's.
// ---------------------------------------------------------------------------

var errors = require(`${__hooks}/glue/providers/errors.js`);

var ALL = {
  plaid: require(`${__hooks}/glue/providers/plaid.js`),
};

/** The provider new links use. */
var DEFAULT = "plaid";

/** The provider a link names; a link from before `provider` was set is Plaid's. */
function of(name) {
  var p = ALL[name || DEFAULT];
  if (!p) throw new errors.ProviderError({ code: "UNKNOWN_PROVIDER", status: "error", message: "Cheddar can't sync this link any more. Remove it and link the bank again." });
  return p;
}

module.exports = {
  ProviderError: errors.ProviderError,
  ALL: ALL,
  DEFAULT: DEFAULT,
  of: of,
  /** The provider new links go through. */
  current: function () {
    return ALL[DEFAULT];
  },
};
