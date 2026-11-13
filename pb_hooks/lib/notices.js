// ---------------------------------------------------------------------------
// The security notices Cheddar emails a person: to the old address when
// someone changes its email (pb_hooks/credentials.pb.js), one when the change
// is asked for and one when it's done; and when two-step sign-in is locked
// by wrong codes, a new authenticator app is set up, or new recovery codes
// are made (pb_hooks/two_step.pb.js). Those are the steps a takeover takes,
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

module.exports = {
  escapeHtml: escapeHtml,
  emailChangeAsked: emailChangeAsked,
  emailChanged: emailChanged,
  codesLocked: codesLocked,
  appChanged: appChanged,
  recoveryCodesNew: recoveryCodesNew,
}
