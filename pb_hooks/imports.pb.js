/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Statement imports (Nuxt's server/data/imports.ts records each one, and
// works out which of its rows are new).
//
//   POST /api/imports/{id}/rows  { rows: [{ external_id, posted, amount_cents,
//        description, payee?, note?, tags?, bank_category? }] } -> { added }
//     Up to 1,000 of the import's rows, in its account, all or none
//     (glue/imports.js). One save each with no request around it: through
//     the record API's batch a row cost several times as much, in its
//     request hook and rule, and a few years of statements ran past nginx's
//     minute.
// ---------------------------------------------------------------------------

routerAdd(
  "POST",
  "/api/imports/{id}/rows",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var body = e.requestInfo().body || {};
    var added = require(`${__hooks}/glue/imports.js`).addRows(e.app, e.auth.id, e.request.pathValue("id"), body.rows);
    return e.json(200, { added: added });
  },
  $apis.requireAuth("users"),
);
