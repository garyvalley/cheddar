/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/mailjet.js with the environment read and the request sent. Required
// inside a handler body, not at file scope: PocketBase's JSVM pool does not
// share file-level declarations with hook callbacks.
// ---------------------------------------------------------------------------

var mail = require(`${__hooks}/lib/mailjet.js`)

/**
 * Sends one message. Returns { ok, skipped, statusCode }. `skipped` means no
 * credentials are configured, the normal state in dev and CI: the caller must
 * not treat it as a failure, or sign-in's new-location alert would make
 * signing in impossible there.
 */
function send(opts) {
  var cfg = mail.config($os.getenv)
  if (!mail.isConfigured(cfg)) {
    console.log("[mailjet] Not configured — skipping mail: " + opts.subject)
    return { ok: false, skipped: true, statusCode: 0 }
  }
  var res = $http.send(mail.request(cfg, opts))
  var ok = res.statusCode >= 200 && res.statusCode < 300
  if (!ok) console.log("[mailjet] Send failed: status=" + res.statusCode)
  return { ok: ok, skipped: false, statusCode: res.statusCode }
}

module.exports = { send: send }
