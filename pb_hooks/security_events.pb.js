/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Recent activity (glue/events.js writes it) is kept 90 days. And, for whoever
// runs Cheddar, an optional heartbeat: with HEALTHCHECK_URL set (a
// Healthchecks.io check, or anything that alerts when pings stop), PocketBase
// pings it every 5 minutes, so a crashed or stuck PocketBase raises an alert.
// The daily bank sync pings HEALTHCHECK_SYNC_URL (bank_links.pb.js).
// ---------------------------------------------------------------------------

cronAdd("security_events_cleanup", "37 5 * * *", () => {
  var cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ")
  $app.findRecordsByFilter("security_events", "created < {:cutoff}", "", 0, 0, { cutoff: cutoff }).forEach(function (row) {
    $app.delete(row)
  })
})

cronAdd("heartbeat", "*/5 * * * *", () => {
  var url = String($os.getenv("HEALTHCHECK_URL") || "").trim()
  if (!url) return
  try {
    $http.send({ url: url, method: "GET", timeout: 10 })
  }
  catch (err) {
    console.log("[heartbeat] ping failed: " + err)
  }
})
