/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Households' records for pb_hooks/households.pb.js, whose rules are
// lib/households.js. And: what a household member shares stops being shared
// when they leave it or are removed, and everything shared with it when it
// closes: their accounts (shared_household) and budgets (household).
// Required inside a handler body (glue/bank_links.js says why).
// ---------------------------------------------------------------------------

/** Throws a lib/households.js refusal ({ status, problem }) as PocketBase's error; does nothing for null. */
function check(refusal) {
  if (!refusal || !refusal.problem) return
  if (refusal.status === 404) throw new NotFoundError(refusal.problem)
  if (refusal.status === 403) throw new ForbiddenError(refusal.problem)
  throw new BadRequestError(refusal.problem)
}

/** The household `userId` belongs to, or null. */
function of(app, userId) {
  try {
    return app.findFirstRecordByFilter("households", "members.id ?= {:user}", { user: userId })
  }
  catch (_) {
    return null
  }
}

/** A household record as lib/households.js reads it, or null. */
function plain(household) {
  return household ? { id: household.id, owner: household.getString("owner"), members: household.get("members") || [] } : null
}

/** The household as the routes answer it: its members with their names and addresses. */
function view(app, household) {
  var owner = household.getString("owner")
  return {
    id: household.id,
    name: household.getString("name"),
    owner: owner,
    members: (household.get("members") || []).map(function (id) {
      var user = app.findRecordById("users", id)
      return { id: id, email: user.getString("email"), name: user.getString("name"), owner: id === owner }
    }),
  }
}

/** Deletes the invitations `filter` names. */
function deleteInvites(app, filter, params) {
  app.findRecordsByFilter("household_invites", filter, "", 0, 0, params).forEach(function (invite) {
    app.delete(invite)
  })
}

/** Stops `owner`'s sharing with `household`; with no owner, everyone's. */
function unshare(app, household, owner) {
  var only = owner ? " && owner = {:owner}" : ""
  app.findRecordsByFilter("accounts", "shared_household = {:household}" + only, "", 0, 0, { household: household, owner: owner || "" })
    .forEach(function (account) {
      account.set("shared_household", "")
      app.save(account)
    })
  app.findRecordsByFilter("budgets", "household = {:household}" + only, "", 0, 0, { household: household, owner: owner || "" })
    .forEach(function (budget) {
      budget.set("household", "")
      app.save(budget)
    })
}

module.exports = { check: check, of: of, plain: plain, view: view, deleteInvites: deleteInvites, unshare: unshare }
