// ---------------------------------------------------------------------------
// The security notices Cheddar emails a person: to the old address when
// someone changes its email (pb_hooks/credentials.pb.js), one when the change
// is asked for and one when it's done; and when two-step sign-in is locked
// by wrong codes, a new authenticator app is set up, or new recovery codes
// are made (pb_hooks/two_step.pb.js); when the password changes
// (credentials.pb.js), a sign-in comes from a device and place not seen
// before (sessions.pb.js), a bank is linked (bank_links.pb.js), and once the
// account is deleted (accounts.pb.js). Those are the steps a takeover takes,
// so whoever took over a session and the password still can't keep the
// person from hearing about it.
//
// Pure: { subject, html } only. The hook sends them.
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]
  })
}

// The same frame as the emails PocketBase sends (migrations/0001_accounts.mjs).
function shell(heading, paragraphs) {
  var body = paragraphs.map(function (text) {
    return "<p style=\"margin:0 0 12px;font-size:15px;line-height:1.5;color:#3d3a33\">" + text + "</p>"
  }).join("")
  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>"
    + "<body style=\"margin:0;padding:0;background:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif\">"
    + "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f6f5f9;padding:40px 20px\"><tr><td align=\"center\">"
    + "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:480px;background:#ffffff;border-radius:12px\"><tr><td style=\"padding:40px 32px\">"
    + "<h1 style=\"margin:0 0 16px;font-size:22px;font-weight:700;color:#1b1a20\">" + heading + "</h1>" + body
    + "</td></tr></table></td></tr></table></body></html>"
}

/** To the old address, when a change to `newEmail` is asked for. */
function emailChangeAsked(newEmail) {
  return {
    subject: "Your Cheddar email is being changed",
    html: shell("Your email is being changed", [
      "Someone signed in to your Cheddar account asked to move it to <strong>" + escapeHtml(newEmail) + "</strong>. "
        + "It moves once that address confirms it.",
      "If this was you, there's nothing to do.",
      "If it wasn't, sign in and change your password now: that cancels the change and signs out every other device.",
    ]),
  }
}

/** To the old address, once the account has moved to `newEmail`. */
function emailChanged(newEmail) {
  return {
    subject: "Your Cheddar email was changed",
    html: shell("Your email was changed", [
      "Your Cheddar account now signs in with <strong>" + escapeHtml(newEmail) + "</strong>, "
        + "and every device that was signed in has been signed out. This address gets no more mail from Cheddar.",
      "If this wasn't you, contact whoever runs your Cheddar, so they can give the account back.",
    ]),
  }
}

/** When five wrong codes after a right password lock sign-in for `duration` ("15 minutes"). */
function codesLocked(duration) {
  return {
    subject: "Someone has your Cheddar password",
    html: shell("Someone has your password", [
      "Someone signed in to Cheddar with your password, then got the code from your authenticator app wrong five times. "
        + "Sign-in is locked for " + escapeHtml(duration) + ", and longer each time it happens again.",
      "If this was you, there's nothing to do: wait, then use the code your app shows now.",
      "If it wasn't, change your password now: Settings, then Password. Your codes kept them out, but they know your password.",
    ]),
  }
}

/** When a new authenticator app replaces the one set up before. */
function appChanged() {
  return {
    subject: "A new authenticator app was set up for Cheddar",
    html: shell("A new authenticator app was set up", [
      "Two-step sign-in for your Cheddar account now uses a new authenticator app, and the old app's codes no longer work. "
        + "New recovery codes were made too.",
      "If this was you, there's nothing to do.",
      "If it wasn't, someone is signed in as you: change your password now, which signs out every other device, and set up your own app again.",
    ]),
  }
}

/** When new recovery codes replace the old ones. */
function recoveryCodesNew() {
  return {
    subject: "New Cheddar recovery codes were made",
    html: shell("New recovery codes were made", [
      "New recovery codes were made for your Cheddar account, and the old ones no longer work.",
      "If this was you, keep the new ones somewhere safe.",
      "If it wasn't, someone is signed in as you: change your password now, which signs out every other device, then make new codes yourself.",
    ]),
  }
}

/** When a passkey is added, named `name` ("iPhone"). A passkey signs in on its own, so this matters as much as a new app. */
function passkeyAdded(name) {
  return {
    subject: "A passkey was added to your Cheddar account",
    html: shell("A passkey was added", [
      "A passkey" + (name ? " named <strong>" + escapeHtml(name) + "</strong>" : "") + " can now sign in to your Cheddar account on its own, without your password or a code.",
      "If this was you, there's nothing to do.",
      "If it wasn't, sign in, remove it in Settings, then Sign-in and security, and change your password, which signs out every other device.",
    ]),
  }
}

/** When the password is changed from Settings; every other device was signed out. */
function passwordChanged() {
  return {
    subject: "Your Cheddar password was changed",
    html: shell("Your password was changed", [
      "The password for your Cheddar account was just changed, and every other device that was signed in has been signed out.",
      "If this was you, there's nothing to do.",
      "If it wasn't, someone is signed in as you: use Forgot password on the sign-in page to choose a new one, then check Settings, then Sign-in and security.",
    ]),
  }
}

/**
 * When someone signs in from a device and place this account hasn't signed in
 * from lately: `device` ("Safari on iPhone") and `place` (a two-letter
 * country, or "").
 */
function newDevice(where) {
  var device = escapeHtml((where && where.device) || "A browser")
  var place = where && where.place ? " in " + escapeHtml(where.place) : ""
  return {
    subject: "New sign-in to your Cheddar account",
    html: shell("A new sign-in", [
      "Your Cheddar account was just signed in to from <strong>" + device + "</strong>" + place + ".",
      "If this was you, there's nothing to do.",
      "If it wasn't, someone has your password and code: change your password now, which signs out every other device, and look at Settings, then Sign-in and security.",
    ]),
  }
}

/** When a bank is linked, named `names` ("Chase, Wells Fargo"). */
function bankLinked(names) {
  return {
    subject: "A bank was linked to your Cheddar account",
    html: shell("A bank was linked", [
      (names ? "<strong>" + escapeHtml(names) + "</strong> was" : "A bank was") + " just linked to your Cheddar account, which can now read its accounts and transactions.",
      "If this was you, there's nothing to do.",
      "If it wasn't, someone is signed in as you: unlink it in Settings, then Accounts and banks, and change your password, which signs out every other device.",
    ]),
  }
}

/** Once the account is deleted, to the address it had. */
function accountDeleted() {
  return {
    subject: "Your Cheddar account was deleted",
    html: shell("Your account was deleted", [
      "Your Cheddar account and everything in it were just deleted: accounts, transactions, receipts and settings. Each linked bank was told to forget it.",
      "This address gets no more mail from Cheddar. To use Cheddar again, sign up anew.",
      "If this wasn't you, contact whoever runs your Cheddar through the contact form.",
    ]),
  }
}

/**
 * To whoever runs Cheddar (CONTACT_TO), for a message from the contact form
 * (pb_hooks/contact.pb.js). Everything the sender typed is escaped; replying
 * goes to their address (the hook sets Reply-To).
 */
function contactMessage(msg, topicLabel, accountEmail) {
  var who = (msg.name ? escapeHtml(msg.name) + " " : "") + "&lt;" + escapeHtml(msg.email) + "&gt;"
  return {
    subject: "Cheddar contact form: " + topicLabel,
    html: shell("A message from the contact form", [
      "From " + who + (accountEmail ? ", signed in to Cheddar as " + escapeHtml(accountEmail) + "." : ", not signed in, so the address is unconfirmed."),
      "About: " + escapeHtml(topicLabel),
      escapeHtml(msg.message).replace(/\r?\n/g, "<br>"),
      "Reply to this email to answer them.",
    ]),
  }
}

module.exports = {
  escapeHtml: escapeHtml,
  contactMessage: contactMessage,
  emailChangeAsked: emailChangeAsked,
  emailChanged: emailChanged,
  codesLocked: codesLocked,
  appChanged: appChanged,
  recoveryCodesNew: recoveryCodesNew,
  passkeyAdded: passkeyAdded,
  passwordChanged: passwordChanged,
  newDevice: newDevice,
  bankLinked: bankLinked,
  accountDeleted: accountDeleted,
}
