/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Bank links' records: linking, syncing and removing a link through its
// provider (glue/providers.js; Plaid is the only one so far). What a sync
// writes is glue/sync_rows.js (accounts, transactions) and
// glue/sync_holdings.js (investment holdings). Nothing here knows which provider it is. Required inside a
// handler body, not at file scope: PocketBase's JSVM pool does not share
// file-level declarations with hook callbacks.
//
// Writes go through the app, not the record API, so they bypass collection
// rules: every account and transaction written here takes its owner from the
// link, and is looked up by that owner, never by an id the caller sent.
// ---------------------------------------------------------------------------

var plaid = require(`${__hooks}/lib/plaid.js`);
var dates = require(`${__hooks}/lib/dates.js`);
var review = require(`${__hooks}/lib/gen/review.js`);
var providers = require(`${__hooks}/glue/providers.js`);

var ProviderError = providers.ProviderError;

var dataKeys = require(`${__hooks}/glue/data_keys.js`);

/** Linking is on with a data key to seal access tokens with (DATA_KEYS, or BANK_LINK_KEY) and the current provider's settings. */
function isEnabled() {
  return dataKeys.hasKey() && providers.current().enabled();
}

/** Why `owner` can't make one more link (lib/plaid.js linkLimit, on the provider's limits), or null. */
function linkLimitFor(app, owner) {
  return plaid.linkLimit(
    providers.current().limits(),
    app.countRecords("bank_links", $dbx.hashExp({ owner: owner })),
    app.countRecords("bank_links"),
  );
}

/** Whether links bring in investment holdings too (PLAID_INVESTMENTS, on the current provider). */
function holdingsOn() {
  var p = providers.current();
  return isEnabled() && !!p.holdings && !!p.holdingsOn && p.holdingsOn();
}

/** Throws when `owner` can't make one more link, and logs which limit it was, so it shows in the cluster's logs. */
function checkLinkLimit(app, owner) {
  var hit = linkLimitFor(app, owner);
  if (!hit) return;
  console.log(
    "[bank_links] " +
      hit.who +
      " limit of " +
      hit.limit +
      " reached: refused a new link for " +
      owner,
  );
  throw new BadRequestError(hit.message);
}

/** An access token sealed with the newest data key (glue/data_keys.js). */
function encrypt(text) {
  return dataKeys.seal(text);
}

/**
 * The link's access token, or null if it can't be read (its key is no longer
 * in DATA_KEYS). One with no key id was sealed with BANK_LINK_KEY, key v1.
 */
function accessOf(link) {
  return dataKeys.open(link.getString("access"), "v1") || null;
}

/** What the page opens the provider's sign-in with: a new link, or with `link`, signing in again to that one. */
function linkToken(userId, link) {
  var access = null;
  if (link) {
    access = accessOf(link);
    if (!access)
      throw new ProviderError({
        code: "UNREADABLE",
        status: "reconnect",
        message:
          "Cheddar can no longer read this link. Remove it and link the bank again.",
      });
  }
  return (link ? providers.of(link.getString("provider")) : providers.current()).linkToken(userId, access);
}

/**
 * Makes a link for `owner` from what the provider's sign-in handed the page,
 * and syncs it for the first time. Answers { link, sync }.
 */
function create(app, owner, publicToken, institutionName, today) {
  var provider = providers.current();
  var token = provider.exchange(publicToken);
  if (!token.access) throw new ProviderError({ code: "NO_ACCESS", status: "error", message: "The bank link didn't finish. Try again." });
  var link = new Record(app.findCollectionByNameOrId("bank_links"));
  link.set("owner", owner);
  link.set("provider", provider.name);
  link.set("access", encrypt(token.access));
  link.set("item_id", token.itemId.slice(0, 200));
  // The sign-in's own word for the bank, until the provider names it.
  var institution = provider.clean(institutionName).slice(0, 100);
  link.set("institutions", institution ? [institution] : []);
  link.set("status", "ok");
  app.save(link);
  // The link is saved: a failed first sync is the link's status to show, not a failed request.
  var result = sync(app, link, today);
  return { link: app.findRecordById("bank_links", link.id), sync: result };
}

/** The link as the app shows it. */
/** The link's banks by name, "Chase, Amex", for Recent activity. */
function namesOf(link) {
  try {
    var list = JSON.parse(link.getString("institutions") || "[]");
    return Array.isArray(list) ? list.join(", ") : "";
  } catch (_) {
    return "";
  }
}

function summary(app, link) {
  var accounts = app.findRecordsByFilter(
    "accounts",
    "link = {:id}",
    "name",
    0,
    0,
    { id: link.id },
  );
  return {
    id: link.id,
    provider: link.getString("provider"),
    brought_in: broughtIn(app, link, accounts),
    institutions: link.get("institutions") || [],
    status: link.getString("status"),
    message: link.getString("message"),
    last_synced: link.getString("last_synced"),
    holdings: link.getString("holdings"),
    accounts: accounts.map(function (a) {
      return {
        id: a.id,
        name: a.getString("name"),
        institution: a.getString("institution"),
        kind: a.getString("kind"),
        last4: a.getString("last4"),
        balance_cents: a.get("balance_cents"),
        balance_date: a.getString("balance_date"),
        closed_on: a.getString("closed_on"),
        excluded: a.getBool("excluded"),
      };
    }),
  };
}

/**
 * What the link has brought in, for Settings to explain: how many
 * transactions and from when, and how many of them are its history, from
 * before `review_from`, which wait outside the review inbox (shared/review.ts).
 */
function broughtIn(app, link, accounts) {
  var out = { count: 0, from: "", history: 0, review_from: review.reviewFrom(link.getString("created")) };
  if (!accounts.length) return out;
  var ids = accounts.map(function (a) {
    return a.id;
  });
  var synced = $dbx.and($dbx.in.apply(null, ["account"].concat(ids)), $dbx.hashExp({ source: "sync" }));
  out.count = app.countRecords("transactions", synced);
  if (!out.count) return out;
  var params = {};
  var filter = ids
    .map(function (id, i) {
      params["a" + i] = id;
      return "account = {:a" + i + "}";
    })
    .join(" || ");
  var first = app.findRecordsByFilter("transactions", "(" + filter + ") && source = 'sync'", "posted", 1, 0, params);
  out.from = first.length ? first[0].getString("posted").slice(0, 10) : "";
  out.history = app.countRecords("transactions", synced, $dbx.hashExp({ history: true }));
  return out;
}

/** Records a failed sync on the link; answers the sync result. */
function failed(app, link, f, result) {
  link.set("status", f.status);
  link.set("message", f.message);
  app.save(link);
  result.problem = f.message;
  return result;
}

/**
 * Fetches the link's balances and new transactions and writes them. Records
 * the outcome on the link either way, and answers
 * { ok, added, updated, removed, problem? }. `today` is the person's own day
 * for the balances' date (dates.personToday); the UTC day without one.
 */
function sync(app, link, today) {
  var now = Date.now();
  var result = { ok: false, added: 0, updated: 0, removed: 0 };
  link.set("last_attempt", dates.toPb(now));

  var access = accessOf(link);
  if (!access) {
    return failed(
      app,
      link,
      {
        status: "reconnect",
        message:
          "Cheddar can no longer read this link. Remove it and link the bank again.",
      },
      result,
    );
  }

  var found;
  var changes;
  try {
    var provider = providers.of(link.getString("provider"));
    found = provider.accounts(
      access,
      (link.get("institutions") || [])[0] || "",
      dates.personToday(today, now),
    );
    changes = provider.changes(access, link.getString("cursor"));
  } catch (err) {
    if (err instanceof ProviderError)
      return failed(app, link, err.failure, result);
    throw err;
  }
  var institution = found.institution;
  var rows = found.rows;
  pointWebhook(link, provider, access);

  var write = require(`${__hooks}/glue/sync_rows.js`);
  app.runInTransaction(function (txApp) {
    var byPlaidId = {};
    rows.forEach(function (row) {
      byPlaidId[row.external_id] = write.accountFor(txApp, link, row);
    });
    var collection = txApp.findCollectionByNameOrId("transactions");
    changes.added.concat(changes.modified).forEach(function (t) {
      var account = byPlaidId[t.account];
      if (!account) return;
      var outcome = write.upsert(txApp, collection, account, t, link.getString("created"));
      if (outcome === "added") result.added++;
      else if (outcome === "updated") result.updated++;
    });
    // A pending charge that posts comes back removed, and again as a new
    // transaction; a refunded or cancelled one is just removed.
    changes.removed.forEach(function (ext) {
      txApp
        .findRecordsByFilter(
          "transactions",
          "owner = {:owner} && source = 'sync' && external_id = {:ext}",
          "",
          0,
          0,
          { owner: link.getString("owner"), ext: ext },
        )
        .forEach(function (rec) {
          txApp.delete(rec);
          result.removed++;
        });
    });
    if (institution) link.set("institutions", [institution]);
    link.set("cursor", changes.cursor);
    link.set("status", "ok");
    link.set("message", "");
    link.set("last_synced", dates.toPb(now));
    txApp.save(link);
  });
  result.ok = true;
  require(`${__hooks}/glue/sync_holdings.js`).syncHoldings(app, link, provider, access, rows, dates.personToday(today, now));
  return result;
}

/**
 * Points a link made before webhooks, or at an older address, at where this
 * Cheddar takes them (provider.webhookUrl(), "" with no https APP_URL), and
 * notes it on the link, which the sync then saves. Best effort: a link that
 * can't be pointed still syncs every day.
 */
function pointWebhook(link, provider, access) {
  var url = provider.webhookUrl ? provider.webhookUrl() : "";
  if (!url || url === link.getString("webhook")) return;
  try {
    provider.setWebhook(access, url);
    link.set("webhook", url);
  } catch (err) {
    console.log(
      "[bank_links] pointing webhooks for " +
        link.id +
        " failed: " +
        (err && err.failure ? err.failure.code : err),
    );
  }
}

/**
 * A webhook from a link's provider, already checked by Nuxt
 * (server/data/plaid-webhook.ts): syncs the link it names when the event
 * calls for it and the last sync isn't moments old. Answers what it did:
 * "synced", "recent", "ignored" or "unknown" (no such link).
 */
function onWebhook(app, providerName, body) {
  var provider = providers.of(providerName);
  if (!provider.webhookEvent) return "ignored";
  var event = provider.webhookEvent(body);
  if (!event.itemId) return "unknown";
  var link;
  try {
    link = app.findFirstRecordByFilter(
      "bank_links",
      "provider = {:p} && item_id = {:item}",
      { p: provider.name, item: event.itemId },
    );
  } catch (_) {
    return "unknown";
  }
  if (!event.sync) return "ignored";
  var last = dates.parsePb(link.getString("last_attempt"));
  if (last && Date.now() - last.getTime() < provider.MIN_SYNC_GAP_MS)
    return "recent";
  var r = sync(app, link);
  if (!r.ok)
    console.log("[bank_links] webhook sync failed for " + link.id + ": " + r.problem);
  return "synced";
}

/** The caller's own link, or a 404 for one that isn't theirs. */
function ownLink(app, auth, id) {
  try {
    var link = app.findRecordById("bank_links", id);
    if (link.getString("owner") === auth.id) return link;
  } catch (_) {
    /* not found: the same answer as someone else's */
  }
  throw new NotFoundError("That link isn't there.");
}

/**
 * Tells the provider to forget a link's access token, so no one is billed for
 * it and the provider keeps no hold on the bank. Called by bank_links.pb.js once a link's
 * row is gone, however it went: unlinking, deleting the whole Cheddar account
 * (the row goes by cascade), or a superuser in the admin UI. Best effort, and
 * never throws: the row is already deleted, and with it the only copy of the
 * token, so a retry later is impossible either way.
 */
function forget(link) {
  try {
    var provider = providers.of(link.getString("provider"));
    if (!provider.enabled()) return;
    var access = accessOf(link);
    if (!access) return;
    provider.remove(access);
  } catch (err) {
    // Already gone at the provider, or it can't be reached.
    console.log(
      "[bank_links] remove at the provider for " +
        link.id +
        " failed: " +
        (err && err.failure ? err.failure.code : err),
    );
  }
}

/**
 * Removes a link: its accounts and their transactions stay, as accounts that
 * no longer sync. Deleting the row is what tells Plaid (forget(), above).
 */
function remove(app, link) {
  app.runInTransaction(function (txApp) {
    txApp
      .findRecordsByFilter("accounts", "link = {:id}", "", 0, 0, {
        id: link.id,
      })
      .forEach(function (a) {
        a.set("link", "");
        txApp.save(a);
      });
    txApp.delete(link);
  });
}

module.exports = {
  ProviderError: ProviderError,
  isEnabled: isEnabled,
  holdingsOn: holdingsOn,
  namesOf: namesOf,
  minSyncGap: function (link) {
    return providers.of(link.getString("provider")).MIN_SYNC_GAP_MS;
  },
  checkLinkLimit: checkLinkLimit,
  linkLimitFor: linkLimitFor,
  linkToken: linkToken,
  create: create,
  summary: summary,
  sync: sync,
  onWebhook: onWebhook,
  ownLink: ownLink,
  remove: remove,
  forget: forget,
};
