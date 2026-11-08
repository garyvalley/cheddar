/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Every mail PocketBase sends (address confirmation, password reset, email
// change, new-location alert) goes out through Mailjet's REST API instead of
// SMTP. Settings come from the environment:
//
//   APP_URL               public origin, e.g. https://cheddar.poweredbycheese.com
//   MAILJET_API_KEY, MAILJET_SECRET_KEY, MAILJET_SENDER_EMAIL, MAILJET_SENDER_NAME
// ---------------------------------------------------------------------------

onBootstrap((e) => {
  // PocketBase finishes its own start-up first; saving settings before that
  // dereferences hooks that aren't ready.
  e.next()

  var appUrl = $os.getenv("APP_URL")
  if (!appUrl) return

  var settings = e.app.settings()
  settings.meta.appURL = appUrl
  settings.meta.appName = "Cheddar"
  var senderEmail = $os.getenv("MAILJET_SENDER_EMAIL")
  if (senderEmail) {
    settings.meta.senderAddress = senderEmail
    settings.meta.senderName = $os.getenv("MAILJET_SENDER_NAME") || "Cheddar"
  }
  // PocketBase fires mailer hooks only with SMTP on; onMailerSend below
  // answers before any SMTP connection is made.
  settings.smtp.enabled = true
  settings.smtp.host = "localhost"
  settings.smtp.port = 587
  e.app.save(settings)
})

onMailerSend((e) => {
  if (!e.message || !e.message.to || e.message.to.length === 0) return
  var to = e.message.to[0]
  var res = require(`${__hooks}/glue/mailjet.js`).send({
    to: to.address,
    toName: to.name || "",
    subject: e.message.subject,
    html: e.message.html,
  })
  // A real send failure surfaces, rather than leaving someone waiting for a
  // reset link that never comes. No e.next(): that would try SMTP.
  if (!res.ok && !res.skipped) throw new Error("Mailjet send failed with status " + res.statusCode)
})
