/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// lib/two_step.js applied to PocketBase: finds the user_totp row and the
// password step, and writes back what a code spent. Nothing here saves; the
// route does.
// ---------------------------------------------------------------------------

var twoStep = require(`${__hooks}/lib/two_step.js`)
var dataKeys = require(`${__hooks}/glue/data_keys.js`)

/** The person's user_totp row, or null. */
function appRow(userId) {
  try {
    return $app.findFirstRecordByFilter("user_totp", "user = {:user}", { user: userId })
  }
  catch (_) {
    return null
  }
}

/**
 * The row's app secret, or its pending one, opened: sealed with a data key
 * (glue/data_keys.js), or plain from before encryption. "" when there's none
 * or its key is gone.
 */
function secretOf(row, field) {
  return dataKeys.open(row.getString(field || "secret"), "plain") || ""
}

/** Stores an app secret (or "") in `field`, sealed with the newest data key. */
function setSecret(row, field, secret) {
  row.set(field, dataKeys.seal(secret))
}

/** "off" or "app" for a users record. */
function method(user) {
  if (!user.getBool("mfa_enabled")) return "off"
  var row = appRow(user.id)
  return twoStep.method(true, row ? row.getString("secret") : "")
}

/**
 * The person behind a password step that is still waiting for its second
 * step, or null. Only PocketBase's password sign-in records that step, and
 * only after a right password.
 */
function passwordStepUser(mfaId) {
  try {
    var mfa = $app.findRecordById("_mfas", String(mfaId || ""))
    if (mfa.getString("method") !== "password") return null
    if (mfa.getString("collectionRef") !== $app.findCollectionByNameOrId("users").id) return null
    return $app.findRecordById("users", mfa.getString("recordRef"))
  }
  catch (_) {
    return null
  }
}

function recoveryHashes(row) {
  return twoStep.recoveryHashes(row.getString("recovery_codes"))
}

/** Replaces the row's recovery codes with new ones; returns them, formatted. */
function newRecoveryCodes(row) {
  var made = twoStep.newRecoveryCodes($security.randomStringWithAlphabet, dataKeys.hashCode)
  row.set("recovery_codes", made.hashes)
  return made.codes
}

/** "app", "recovery" or "" for a code typed at sign-in, spending what it accepts on the row. */
function acceptCode(row, code) {
  var got = twoStep.acceptCode(
    { secret: secretOf(row), last_step: row.getInt("last_step"), hashes: recoveryHashes(row) },
    code, Date.now(), dataKeys.codeMatcher())
  if (got.kind === "app") row.set("last_step", got.last_step)
  if (got.kind === "recovery") row.set("recovery_codes", got.hashes)
  return got.kind
}

/**
 * Emails the person one of lib/notices.js's security notices (`kind`, with
 * `arg`). Best effort: the step it reports is already done, so a notice that
 * fails to send must not undo it.
 */
function notify(user, kind, arg) {
  try {
    var notice = require(`${__hooks}/lib/notices.js`)[kind](arg)
    require(`${__hooks}/glue/mailjet.js`).send({ to: user.email(), toName: user.getString("name"), subject: notice.subject, html: notice.html })
  }
  catch (err) {
    console.log("[two_step] Could not send the " + kind + " notice: " + err)
  }
}

module.exports = {
  notify: notify,
  secretOf: secretOf,
  setSecret: setSecret,
  appRow: appRow,
  method: method,
  passwordStepUser: passwordStepUser,
  recoveryHashes: recoveryHashes,
  newRecoveryCodes: newRecoveryCodes,
  acceptCode: acceptCode,
}
