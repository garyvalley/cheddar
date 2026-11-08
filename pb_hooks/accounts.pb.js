/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Deleting your own account: POST /api/delete-account { password }.
//
// The users collection's delete rule is closed, so this route, which asks for
// the password, is the only way: a stolen session alone can't destroy
// someone's records. Everything the account owns cascades with it.
// ---------------------------------------------------------------------------

routerAdd("POST", "/api/delete-account", (e) => {
  var user = e.app.findRecordById("users", e.auth.id)
  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }
  e.app.delete(user)
  return e.noContent(204)
}, $apis.requireAuth("users"))
