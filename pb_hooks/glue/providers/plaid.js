/// <reference path="../../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Plaid as a bank-link provider (glue/providers.js says what one is):
// lib/plaid.js's pure pieces, with the environment read and the requests
// sent. Required inside a handler body, as every glue module is.
// ---------------------------------------------------------------------------

var plaid = require(`${__hooks}/lib/plaid.js`);
var errors = require(`${__hooks}/glue/providers/errors.js`);

var NAME = "plaid";

function cfg() {
  return plaid.config($os.getenv);
}

/** One Plaid call: its JSON on success, or throws a ProviderError. */
function call(path, body) {
  var res;
  try {
    res = $http.send(plaid.request(cfg(), path, body));
  } catch (_) {
    throw new errors.ProviderError(plaid.failure(0, null));
  }
  if (res.statusCode !== 200) {
    var f = plaid.failure(res.statusCode, res.json);
    console.log("[plaid] " + path + " failed: " + f.code);
    throw new errors.ProviderError(f);
  }
  return res.json;
}

/** Fetches every page of what's changed since `cursor`. */
function fetchChanges(access, cursor) {
  var all = { added: [], modified: [], removed: [], cursor: cursor };
  for (var page = 0; page < plaid.MAX_PAGES; page++) {
    var body = { access_token: access, count: 500 };
    if (all.cursor) body.cursor = all.cursor;
    var p = plaid.syncPage(call("/transactions/sync", body));
    all.added = all.added.concat(p.added);
    all.modified = all.modified.concat(p.modified);
    all.removed = all.removed.concat(p.removed);
    all.cursor = p.cursor || all.cursor;
    if (!p.more) break;
  }
  return all;
}

module.exports = {
  name: NAME,
  enabled: function () {
    return plaid.isEnabled(cfg());
  },
  /** { perPerson, maxLinks }: Plaid bills whoever runs Cheddar per linked bank. */
  limits: function () {
    var c = cfg();
    return { perPerson: c.perPerson, maxLinks: c.maxLinks };
  },
  /** What the page opens Plaid Link with: a new link, or with `access`, signing in to that one again. */
  linkToken: function (userId, access) {
    return String(
      call("/link/token/create", plaid.linkTokenBody(userId, access || null, plaid.webhookUrl($os.getenv("APP_URL"))))
        .link_token || "",
    );
  },
  /** Where this Cheddar's links should send webhooks, or "" for none (not https). */
  webhookUrl: function () {
    return plaid.webhookUrl($os.getenv("APP_URL"));
  },
  /** Points a link made before webhooks (or at another address) at `url`. */
  setWebhook: function (access, url) {
    call("/item/webhook/update", { access_token: access, webhook: url });
  },
  /** The public key (a JWK) Plaid signs webhooks with under `kid`, or null once it has expired. */
  webhookKey: function (kid) {
    var key = (call("/webhook_verification_key/get", { key_id: kid }) || {}).key || null;
    if (!key || (key.expired_at && Number(key.expired_at) * 1000 < Date.now())) return null;
    return { kty: key.kty, crv: key.crv, x: key.x, y: key.y, kid: key.kid, alg: key.alg };
  },
  /** A webhook's body as { itemId, sync } (lib/plaid.js webhookEvent). */
  webhookEvent: plaid.webhookEvent,
  /** Link's public_token as { access, itemId }. */
  exchange: function (publicToken) {
    if (!/^public-[a-z]+-[A-Za-z0-9-]{8,200}$/.test(publicToken))
      throw new errors.ProviderError({
        code: "BAD_PUBLIC_TOKEN",
        status: "error",
        message: "Plaid didn't finish linking. Try again.",
      });
    var out = call("/item/public_token/exchange", {
      public_token: publicToken,
    });
    return {
      access: String(out.access_token || ""),
      itemId: String(out.item_id || ""),
    };
  },
  /** The link's accounts: { institution, rows } (lib/plaid.js accountRows). */
  accounts: function (access, fallbackInstitution, today) {
    var json = call("/accounts/get", { access_token: access });
    var item = json.item || {};
    var institution = plaid.clean(item.institution_name) || fallbackInstitution || "";
    return { institution: institution, rows: plaid.accountRows(json, institution, today) };
  },
  /** What's changed since `cursor`: { added, modified, removed, cursor }. */
  changes: function (access, cursor) {
    try {
      return fetchChanges(access, cursor);
    } catch (err) {
      // The bank's data changed between pages: start again from the saved cursor, once.
      if (
        !(err instanceof errors.ProviderError) ||
        err.failure.code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
      )
        throw err;
      return fetchChanges(access, cursor);
    }
  },
  /** Tells Plaid to forget the link, so nobody is billed for it. */
  remove: function (access) {
    call("/item/remove", { access_token: access });
  },
  clean: plaid.clean,
  MIN_SYNC_GAP_MS: plaid.MIN_SYNC_GAP_MS,
};
