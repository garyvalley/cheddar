/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// What credentials.pb.js's routes share. Required inside a handler body, not
// at file scope: PocketBase's JSVM pool does not share file-level
// declarations with hook callbacks.
// ---------------------------------------------------------------------------

/**
 * The caller's record, once two-step sign-in is on and the body's `password`
 * is theirs: a session alone is not enough to change how the account signs in.
 */
function owner(e) {
  var user = e.app.findRecordById("users", e.auth.id)
  if (!user.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }
  return user
}

module.exports = { owner: owner }
