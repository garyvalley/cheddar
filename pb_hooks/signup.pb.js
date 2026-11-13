/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Who may sign up: SIGNUP and SIGNUP_ALLOW (lib/signup.js). The users
// collection lets anyone create an account (createRule ''); this hook turns
// away the ones the setting doesn't allow, however the request arrives.
// A superuser (the admin UI, `pnpm run setup`) can always make one.
//
//   GET /api/sign-up -> { mode }: open, invite or closed, so the sign-up page
//                       can say so before anyone fills it in. Never the list.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var signup = require(`${__hooks}/lib/signup.js`)
    var cfg = signup.config($os.getenv)
    if (!signup.allows(cfg, e.record.getString("email"))) {
      console.log("[signup] refused a new account (SIGNUP=" + cfg.mode + ")")
      throw new BadRequestError(signup.refusal(cfg))
    }
  }
  e.next()
}, "users")

routerAdd("GET", "/api/sign-up", (e) => {
  var signup = require(`${__hooks}/lib/signup.js`)
  return e.json(200, { mode: signup.config($os.getenv).mode })
})
