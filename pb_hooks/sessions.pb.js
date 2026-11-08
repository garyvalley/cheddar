/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Sign out everywhere. Every token PocketBase issues is signed with the
// account's tokenKey, so a new tokenKey ends all of them at once -- the
// remedy for a lost phone or a shared computer.
// ---------------------------------------------------------------------------

routerAdd("POST", "/api/sign-out-everywhere", (e) => {
  var user = e.app.findRecordById("users", e.auth.id)
  user.refreshTokenKey()
  e.app.save(user)
  return e.noContent(204)
}, $apis.requireAuth("users"))
