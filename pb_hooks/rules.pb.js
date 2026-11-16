/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Settings → Rules: the person's own rules for their transactions and the
// merchant rules Cheddar learned (glue/rules.js, shared/rules.ts). Only
// these routes and glue/categories.js read either collection, always for
// the signed-in person alone.
//
//   GET  /api/rules                         -> { rules, merchant }
//   POST /api/rules                         { ...rule, apply } -> { rule, applied }
//   POST /api/rules/{id}                    { ...rule, apply } -> { rule, applied }
//   POST /api/rules/{id}/remove             -> { resorted }
//   POST /api/merchant-rules/{id}           { category } -> { rule, moved }
//   POST /api/merchant-rules/{id}/remove    -> { resorted }
// ---------------------------------------------------------------------------

routerAdd(
  "GET",
  "/api/rules",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    return e.json(
      200,
      require(`${__hooks}/glue/rules.js`).list(e.app, e.auth.id),
    );
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/rules",
  (e) => require(`${__hooks}/glue/rules.js`).saveRoute(e, ""),
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/rules/{id}",
  (e) =>
    require(`${__hooks}/glue/rules.js`).saveRoute(e, e.request.pathValue("id")),
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/rules/{id}/remove",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var r = require(`${__hooks}/glue/rules.js`).remove(
      e.app,
      e.auth.id,
      e.request.pathValue("id"),
    );
    if (!r) throw new NotFoundError("That rule isn't there.");
    return e.json(200, r);
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/merchant-rules/{id}",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var r = require(`${__hooks}/glue/rules.js`).setMerchant(
      e.app,
      e.auth.id,
      e.request.pathValue("id"),
      String((e.requestInfo().body || {}).category || ""),
    );
    if (!r) throw new NotFoundError("That rule isn't there.");
    if (r.problem) throw new BadRequestError(r.problem);
    return e.json(200, r);
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/merchant-rules/{id}/remove",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var r = require(`${__hooks}/glue/rules.js`).removeMerchant(
      e.app,
      e.auth.id,
      e.request.pathValue("id"),
    );
    if (!r) throw new NotFoundError("That rule isn't there.");
    return e.json(200, r);
  },
  $apis.requireAuth("users"),
);
