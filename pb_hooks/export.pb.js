/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Exporting everything: POST /api/export { password } -> { category_rules, rules }.
//
// It asks for the password, as deleting the account does: a stolen session
// alone can't carry off everything at once. A right password answers with
// what only the hooks can read, the person's merchant rules and their own
// rules (glue/rules.js); Nuxt reads the
// rest through the record API as the person (server/data/export.ts) only
// after this answers. Nothing here, or there, reads bank-link tokens or
// two-step secrets.
// ---------------------------------------------------------------------------

routerAdd("POST", "/api/export", (e) => {
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var user = e.app.findRecordById("users", e.auth.id)
  if (!user.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
    throw new BadRequestError("That password is not right.")
  }
  var rules = e.app.findRecordsByFilter("category_rules", "owner = {:owner}", "merchant", 0, 0, { owner: e.auth.id })
  require(`${__hooks}/glue/events.js`).record(e.app, e.auth.id, "export", e)
  return e.json(200, {
    category_rules: rules.map(function (r) { return { merchant: r.getString("merchant"), category: r.getString("category") } }),
    rules: require(`${__hooks}/glue/categories.js`).rulesOf(e.app, e.auth.id).map(function (r) {
      return { text: r.text, min_cents: r.min_cents, max_cents: r.max_cents, account: r.account, category: r.category, rename: r.rename, exclude: r.exclude }
    }),
  })
}, $apis.requireAuth("users"))
