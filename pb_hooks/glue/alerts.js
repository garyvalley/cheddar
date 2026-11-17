/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Alerts by email (pb_hooks/alerts.pb.js, shared/alerts.ts). For each person
// with an alert on: read what each alert needs, ask shared/alerts.ts which
// are due, email the new ones as one message, and keep their keys in
// `alert_log` so each goes once. Charges and banks are looked at every run;
// balances, bills, budgets and the weekly summary once a day (`daily`).
// Required inside a handler body, not at file scope (glue/bank_links.js
// says why).
// ---------------------------------------------------------------------------

var lib = require(`${__hooks}/lib/gen/alerts.js`);

var DAY_MS = 86400000;
var ymd = function (ms) {
  return new Date(ms).toISOString().slice(0, 10);
};
var pbDate = function (ms) {
  return new Date(ms).toISOString().replace("T", " ");
};

function settingsOf(rec) {
  return {
    charge_over_cents: rec.getInt("charge_over_cents"),
    balance_under_cents: rec.getInt("balance_under_cents"),
    bills: rec.getBool("bills"),
    budgets: rec.getBool("budgets"),
    banks: rec.getBool("banks"),
    weekly: rec.getBool("weekly"),
  };
}

function all(app, collection, filter, params) {
  return app.findRecordsByFilter(collection, filter, "", 0, 0, params);
}

/** The person's own accounts, as shared/accounts.ts's Account has them. */
function accountsOf(app, owner) {
  return all(app, "accounts", "owner = {:owner}", { owner: owner }).map(function (r) {
    return {
      id: r.id,
      name: r.getString("name"),
      kind: r.getString("kind"),
      balance_cents: r.getString("balance_date") ? r.getInt("balance_cents") : null,
      balance_date: r.getString("balance_date"),
      excluded: r.getBool("excluded"),
      closed_on: r.getString("closed_on"),
    };
  });
}

/** Counted rows from `from` to `to` (YYYY-MM-DD), the person's and their household's shared ones, as Spending counts them. */
function countedRows(app, owner, from, to) {
  return all(
    app,
    "transactions",
    "(owner = {:owner} || account.shared_household.members.id ?= {:owner}) && excluded = false && account.excluded = false && posted >= {:from} && posted <= {:to}",
    { owner: owner, from: from, to: to },
  ).map(function (r) {
    return {
      posted: r.getString("posted"),
      amount_cents: r.getInt("amount_cents"),
      category: r.getString("category"),
      splits: JSON.parse(r.getString("splits") || "null"),
    };
  });
}

function chargeAlerts(app, owner, settings, since, today, names) {
  var rows = app.findRecordsByFilter(
    "transactions",
    "owner = {:owner} && created > {:since} && posted >= {:recent} && pending = false && excluded = false && account.excluded = false && amount_cents <= {:most}",
    "posted",
    50,
    0,
    {
      owner: owner,
      since: since,
      recent: lib.addDays(today, -lib.CHARGE_DAYS),
      most: -settings.charge_over_cents,
    },
  );
  return lib.chargeAlerts(
    rows.map(function (r) {
      return {
        id: r.id,
        posted: r.getString("posted"),
        amount_cents: r.getInt("amount_cents"),
        name: r.getString("payee") || r.getString("description") || "A charge",
        account_name: names[r.getString("account")] || "your account",
      };
    }),
    settings.charge_over_cents,
  );
}

function bankAlerts(app, owner, now, today) {
  var banks = require(`${__hooks}/glue/bank_links.js`);
  var links = all(app, "bank_links", "owner = {:owner}", { owner: owner }).map(function (l) {
    return banks.summary(app, l);
  });
  return lib.bankAlerts(lib.linkHealth(links, now, today));
}

function billAlerts(app, owner, accounts, today, names) {
  var cats = require(`${__hooks}/glue/categories.js`);
  var from = Number(today.slice(0, 4)) - lib.LOOKBACK_YEARS + today.slice(4);
  var charges = all(
    app,
    "transactions",
    "owner = {:owner} && posted >= {:from} && amount_cents < 0 && pending = false && excluded = false && account.excluded = false",
    { owner: owner, from: from },
  ).map(function (r) {
    return {
      account: r.getString("account"),
      posted: r.getString("posted"),
      amount_cents: r.getInt("amount_cents"),
      merchant_key: r.getString("merchant_key"),
      payee: r.getString("payee"),
      description: r.getString("description"),
      category: r.getString("category"),
      pending: false,
    };
  });
  var detected = lib.recurring(charges, cats.list(app, owner), today).items;
  var items = all(app, "cashflow_items", "owner = {:owner}", { owner: owner }).map(function (r) {
    return {
      id: r.id,
      name: r.getString("name"),
      account: r.getString("account"),
      direction: r.getString("direction"),
      amount_cents: r.getInt("amount_cents"),
      cadence: r.getString("cadence"),
      next_date: r.getString("next_date"),
      source_key: r.getString("source_key"),
    };
  });
  var forecast = lib.cashflowForecast(accounts, items, detected, today, lib.BILL_DAYS);
  return lib.billAlerts(forecast.events, new Map(Object.entries(names)), today);
}

function budgetAlerts(app, owner, today) {
  var cats = require(`${__hooks}/glue/categories.js`);
  var month = today.slice(0, 7);
  var budgets = all(app, "budgets", "owner = {:owner}", { owner: owner }).map(function (r) {
    return {
      category: r.getString("category"),
      amount_cents: r.getInt("amount_cents"),
      rollover: r.getBool("rollover"),
      rollover_from: r.getString("rollover_from"),
    };
  });
  if (!budgets.length) return [];
  var list = cats.list(app, owner);
  var first = lib.carryFrom(budgets, month);
  var rows = countedRows(app, owner, (first || month) + "-01", today);
  var carried = lib.withCarry(budgets, rows, list, month);
  var thisMonth = lib.expandSplits(rows).filter(function (r) {
    return r.posted.slice(0, 7) === month;
  });
  var over = lib.overBudget(
    lib.summarize(thisMonth, list).categories,
    carried.map(function (b) {
      return { category: b.category, budget_cents: b.amount_cents + b.carry_cents };
    }),
  );
  return lib.budgetAlerts(over, month);
}

function weeklyAlert(app, owner, today) {
  var cats = require(`${__hooks}/glue/categories.js`);
  var rows = lib.expandSplits(countedRows(app, owner, lib.addDays(today, -7), lib.addDays(today, -1)));
  var totals = lib.summarize(rows, cats.list(app, owner)).categories;
  var income = totals
    .filter(function (c) {
      return c.id === "income";
    })
    .reduce(function (n, c) {
      return n + c.total_cents;
    }, 0);
  return lib.weeklyAlert(today, totals, income);
}

/**
 * One person's alerts. `now` is the run's time (ms); `daily` says whether
 * the once-a-day ones are looked at too. Answers the alerts sent.
 */
function runFor(app, settingsRec, now, daily) {
  var owner = settingsRec.getString("owner");
  var user = app.findRecordById("users", owner);
  var settings = settingsOf(settingsRec);
  // Hooks have no time zone data; the daily run is at an hour that is the
  // same day across the US (alerts.pb.js).
  var today = ymd(now);
  var since = settingsRec.getString("checked");
  settingsRec.set("checked", pbDate(now));
  app.saveNoValidate(settingsRec);
  if (!user.getBool("verified") || !lib.anyOn(settings)) return [];

  var accounts = accountsOf(app, owner);
  var names = {};
  accounts.forEach(function (a) {
    names[a.id] = a.name;
  });
  var found = [];
  var lookedAt = {};
  if (settings.charge_over_cents > 0 && since) found = found.concat(chargeAlerts(app, owner, settings, since, today, names));
  if (settings.banks) {
    found = found.concat(bankAlerts(app, owner, now, today));
    lookedAt.bank = true;
  }
  if (daily) {
    if (settings.balance_under_cents > 0) {
      found = found.concat(lib.balanceAlerts(accounts, settings.balance_under_cents, today));
      lookedAt.balance = true;
    }
    if (settings.bills) found = found.concat(billAlerts(app, owner, accounts, today, names));
    if (settings.budgets) found = found.concat(budgetAlerts(app, owner, today));
    if (settings.weekly && new Date(now).getUTCDay() === 1) found.push(weeklyAlert(app, owner, today));
  }

  var log = all(app, "alert_log", "owner = {:owner}", { owner: owner });
  var sent = new Set(
    log.map(function (r) {
      return r.getString("key");
    }),
  );
  // A lasting alert's key is kept only while it holds: gone, it may be said again.
  var holding = new Set(
    found.map(function (a) {
      return a.key;
    }),
  );
  log.forEach(function (r) {
    var kind = r.getString("kind");
    if (lib.LASTING.has(kind) && (lookedAt[kind] || !settings[kind === "bank" ? "banks" : "balance_under_cents"]) && !holding.has(r.getString("key")))
      app.delete(r);
  });

  var fresh = lib.due(found, sent);
  if (!fresh.length) return [];
  var mail = lib.alertEmail(fresh, $os.getenv("APP_URL") || "");
  var res = require(`${__hooks}/glue/mailjet.js`).send({
    to: user.getString("email"),
    toName: user.getString("name"),
    subject: mail.subject,
    html: mail.html,
  });
  // A failed send is tried again next run; without mail set up (dev, CI)
  // they count as sent, or every run would build them again.
  if (!res.ok && !res.skipped) return [];
  var logs = app.findCollectionByNameOrId("alert_log");
  fresh.forEach(function (a) {
    var r = new Record(logs);
    r.set("owner", owner);
    r.set("key", a.key);
    r.set("kind", a.kind);
    app.save(r);
  });
  return fresh;
}

/** Every person with alerts on. Answers how many alerts went out. */
function run(app, now, daily) {
  var total = 0;
  var rows = all(
    app,
    "alert_settings",
    "charge_over_cents > 0 || balance_under_cents > 0 || bills = true || budgets = true || banks = true || weekly = true",
    {},
  );
  rows.forEach(function (rec) {
    try {
      total += runFor(app, rec, now, daily).length;
    } catch (err) {
      console.log("[alerts] couldn't check " + rec.getString("owner") + ": " + err);
    }
  });
  // Keys older than 120 days: a lasting state that old may be said again.
  try {
    app.findRecordsByFilter("alert_log", "created < {:old}", "", 0, 0, { old: pbDate(now - 120 * DAY_MS) }).forEach(function (r) {
      app.delete(r);
    });
  } catch (err) {
    console.log("[alerts] couldn't tidy the log: " + err);
  }
  return total;
}

module.exports = { run: run, runFor: runFor };
