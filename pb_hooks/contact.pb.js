/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// The contact form's messages (shared/contact.ts, as lib/gen/contact.js), to
// whoever runs Cheddar. Nuxt's POST /api/contact sends them here, as the
// person when they're signed in; PocketBase itself is never public, and
// nginx rate-limits the form. Each one is kept in `contact_messages` (all
// rules null: read in the admin UI) and, when CONTACT_TO is set, emailed
// there with Reply-To set to the sender. Kept KEEP_DAYS, then deleted.
//
//   POST /api/contact { name, email, topic, message } -> 204
// ---------------------------------------------------------------------------

routerAdd("POST", "/api/contact", (e) => {
  var contact = require(`${__hooks}/lib/gen/contact.js`)
  var checked = contact.checkContact(e.requestInfo().body || {})
  if (checked.problem) throw new BadRequestError(checked.problem)
  var msg = checked.ok
  var user = e.auth && e.auth.collection().name === "users" ? e.auth : null

  var row = new Record(e.app.findCollectionByNameOrId("contact_messages"))
  row.set("name", msg.name)
  row.set("email", msg.email)
  row.set("topic", msg.topic)
  row.set("message", msg.message)
  if (user) row.set("user", user.id)
  e.app.save(row)

  var to = $os.getenv("CONTACT_TO")
  if (to) {
    try {
      var notice = require(`${__hooks}/lib/notices.js`).contactMessage(msg, contact.topicLabel(msg.topic), user ? user.email() : "")
      require(`${__hooks}/glue/mailjet.js`).send({ to: to, subject: notice.subject, html: notice.html, replyTo: msg.email, replyToName: msg.name })
    }
    catch (err) {
      // Kept either way: the admin UI still has it.
      console.log("[contact] Couldn't email a message: " + err)
    }
  }
  return e.noContent(204)
})

cronAdd("contact_messages_cleanup", "41 5 * * *", () => {
  var contact = require(`${__hooks}/lib/gen/contact.js`)
  var cut = new Date(Date.now() - contact.KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString().replace("T", " ")
  $app.findRecordsByFilter("contact_messages", "created < {:cut}", "", 0, 0, { cut: cut }).forEach(function (row) {
    $app.delete(row)
  })
})
