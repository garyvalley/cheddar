/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Moving stored secrets to the newest data key (lib/data_keys.js), so an old
// key can be retired: each two-step app secret and each bank link's access
// token not yet sealed with the first key in DATA_KEYS is opened with its own
// and sealed again. Two-step secrets from before encryption are sealed the
// first time this runs. Runs every night, and on demand for a superuser:
//
//   POST /api/data-keys/reseal   -> { current, resealed, unreadable, codes_on_old_keys }
//
// k8s/README.md "Rotating the data key" says how to rotate.
// ---------------------------------------------------------------------------

routerAdd("POST", "/api/data-keys/reseal", (e) => {
  var out = require(`${__hooks}/glue/data_keys.js`).resealAll(e.app)
  console.log("[data_keys] reseal: " + JSON.stringify(out))
  return e.json(200, out)
}, $apis.requireSuperuserAuth())

cronAdd("data_keys_reseal", "41 4 * * *", () => {
  try {
    var out = require(`${__hooks}/glue/data_keys.js`).resealAll($app)
    if (out.resealed || out.unreadable) console.log("[data_keys] reseal: " + JSON.stringify(out))
  }
  catch (err) {
    console.log("[data_keys] reseal failed: " + err)
  }
})
