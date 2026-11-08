/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// The Mailjet request for one message. Plain values in and out, so Node can
// run it; pb_hooks/glue/mailjet.js reads the environment and sends.
// ---------------------------------------------------------------------------

/** Base64 encoder — the Goja runtime has no btoa. */
function base64(str) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  var result = ""
  for (var i = 0; i < str.length; i += 3) {
    var a = str.charCodeAt(i)
    var b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0
    var c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0
    result += chars[a >> 2]
    result += chars[((a & 3) << 4) | (b >> 4)]
    result += i + 1 < str.length ? chars[((b & 15) << 2) | (c >> 6)] : "="
    result += i + 2 < str.length ? chars[c & 63] : "="
  }
  return result
}

/** Mailjet settings, from `getenv` (an environment reader such as $os.getenv). */
function config(getenv) {
  return {
    apiKey: getenv("MAILJET_API_KEY"),
    secretKey: getenv("MAILJET_SECRET_KEY"),
    senderEmail: getenv("MAILJET_SENDER_EMAIL"),
    senderName: getenv("MAILJET_SENDER_NAME") || "Cheddar",
  }
}

function isConfigured(cfg) {
  return !!(cfg.apiKey && cfg.secretKey && cfg.senderEmail)
}

/** The Mailjet REST request for one message (`opts`: to, toName, subject, html), as $http.send takes it. */
function request(cfg, opts) {
  return {
    method: "POST",
    url: "https://api.mailjet.com/v3.1/send",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + base64(cfg.apiKey + ":" + cfg.secretKey),
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: cfg.senderEmail, Name: cfg.senderName },
        To: [{ Email: opts.to, Name: opts.toName || "" }],
        Subject: opts.subject,
        HTMLPart: opts.html,
      }],
    }),
    timeout: 15,
  }
}

module.exports = {
  base64: base64,
  config: config,
  isConfigured: isConfigured,
  request: request,
}
