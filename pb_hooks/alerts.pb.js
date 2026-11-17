/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Alerts by email (glue/alerts.js, shared/alerts.ts, issue #105).
//
//   Every hour: new charges over the person's amount, and banks that need
//   them. At 15:00 UTC (7 or 8 in the morning on the US west coast, the
//   same day everywhere in the US) also low balances, bills due in the next
//   3 days, budgets passed this month and, on Mondays, the week's summary.
//
//   POST /api/alerts/check -> { sent: [text] }
//     Looks now, as the daily run would, and emails what's new.
//
// `alert_settings.checked` (when charges were last looked for) is the
// hooks' alone: the record API's writes to it are dropped.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("checked", "");
  e.next();
}, "alert_settings");

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("checked", e.record.original().getString("checked"));
  e.next();
}, "alert_settings");

cronAdd("alerts", "5 * * * *", () => {
  var now = Date.now();
  var sent = require(`${__hooks}/glue/alerts.js`).run($app, now, new Date(now).getUTCHours() === 15);
  if (sent) console.log("[alerts] sent " + sent);
});

routerAdd(
  "POST",
  "/api/alerts/check",
  (e) => {
    if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.");
    var rec;
    try {
      rec = e.app.findFirstRecordByFilter("alert_settings", "owner = {:owner}", { owner: e.auth.id });
    } catch (_) {
      throw new BadRequestError("Turn an alert on first.");
    }
    var sent = require(`${__hooks}/glue/alerts.js`).runFor(e.app, rec, Date.now(), true);
    return e.json(200, {
      sent: sent.map(function (a) {
        return a.text;
      }),
    });
  },
  $apis.requireAuth("users"),
);
