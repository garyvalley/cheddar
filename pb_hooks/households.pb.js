/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Households (opt-in sharing, migrations/0020): one per person at most, made
// by its owner, who invites verified people by address; an invitee joins
// only by accepting. The owner shares chosen accounts with it and removes
// members; anyone else may leave, and the owner closes it once alone.
//
//   GET    /api/household                     -> { household, accounts, invitations }
//   POST   /api/household                     { name }   -> 201 { household }
//   POST   /api/household/invite              { email }  -> 201 { invited }
//   POST   /api/household/invites/{id}/accept -> { household }
//   DELETE /api/household/members/{id}        -> 204
//   POST   /api/household/leave               -> 204
//   POST   /api/household/accounts/{id}/share { shared } -> { shared }
//
// The rules are lib/households.js (pure, unit-tested); glue/households.js
// reads and saves the records.
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/household", (e) => {
  var glue = require(`${__hooks}/glue/households.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var household = glue.of(e.app, e.auth.id)
  var accounts = household
    ? e.app.findRecordsByFilter("accounts", "owner = {:owner}", "name", 0, 0, { owner: e.auth.id }).map(function (account) {
        return { id: account.id, name: account.getString("name"), shared: account.getString("shared_household") === household.id }
      })
    : []
  var invitations = e.app.findRecordsByFilter("household_invites", "invitee = {:user}", "-created", 50, 0, { user: e.auth.id }).map(function (invite) {
    return {
      id: invite.id,
      name: e.app.findRecordById("households", invite.getString("household")).getString("name"),
      invited_by: e.app.findRecordById("users", invite.getString("invited_by")).getString("name"),
    }
  })
  return e.json(200, { household: household ? glue.view(e.app, household) : null, accounts: accounts, invitations: invitations })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/household", (e) => {
  var glue = require(`${__hooks}/glue/households.js`)
  var rules = require(`${__hooks}/lib/households.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var made = rules.newHousehold((e.requestInfo().body || {}).name, !!glue.of(e.app, e.auth.id))
  glue.check(made)
  var household = new Record(e.app.findCollectionByNameOrId("households"))
  household.set("owner", e.auth.id)
  household.set("members", [e.auth.id])
  household.set("name", made.name)
  e.app.save(household)
  return e.json(201, { household: glue.view(e.app, household) })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/household/invite", (e) => {
  var glue = require(`${__hooks}/glue/households.js`)
  var rules = require(`${__hooks}/lib/households.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var household = glue.of(e.app, e.auth.id)
  glue.check(rules.ownerOnly(glue.plain(household), e.auth.id))
  var address = rules.inviteEmail((e.requestInfo().body || {}).email)
  glue.check(address)
  var invitee = null
  try {
    invitee = e.app.findFirstRecordByFilter("users", "email:lower = {:email}", { email: address.email })
  }
  catch (_) {
    /* no such account: the same answer as one that can't be invited */
  }
  var pending = false
  if (invitee) {
    try {
      e.app.findFirstRecordByFilter("household_invites", "household = {:household} && invitee = {:invitee}", { household: household.id, invitee: invitee.id })
      pending = true
    }
    catch (_) {
      /* none waiting */
    }
  }
  glue.check(rules.canInvite(invitee ? { id: invitee.id, verified: invitee.getBool("verified"), inHousehold: !!glue.of(e.app, invitee.id) } : null, e.auth.id, pending))
  var invite = new Record(e.app.findCollectionByNameOrId("household_invites"))
  invite.set("household", household.id)
  invite.set("invitee", invitee.id)
  invite.set("invited_by", e.auth.id)
  e.app.save(invite)
  return e.json(201, { invited: true })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/household/invites/{id}/accept", (e) => {
  var glue = require(`${__hooks}/glue/households.js`)
  var rules = require(`${__hooks}/lib/households.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var invite = null
  try {
    invite = e.app.findRecordById("household_invites", e.request.pathValue("id"))
  }
  catch (_) {
    /* not found: the same answer as someone else's */
  }
  if (!invite || invite.getString("invitee") !== e.auth.id) throw new NotFoundError("That invitation isn't there.")
  var household = e.app.findRecordById("households", invite.getString("household"))
  var joined = rules.accept(household.get("members"), e.auth.id, !!glue.of(e.app, e.auth.id))
  glue.check(joined)
  household.set("members", joined.members)
  e.app.runInTransaction(function (txApp) {
    txApp.save(household)
    txApp.delete(invite)
  })
  return e.json(200, { household: glue.view(e.app, household) })
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/household/members/{id}", (e) => {
  var glue = require(`${__hooks}/glue/households.js`)
  var rules = require(`${__hooks}/lib/households.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var household = glue.of(e.app, e.auth.id)
  var user = e.request.pathValue("id")
  var removed = rules.removeMember(glue.plain(household), e.auth.id, user)
  glue.check(removed)
  household.set("members", removed.members)
  e.app.save(household)
  glue.unshare(e.app, household.id, user)
  glue.deleteInvites(e.app, "household = {:household} && invitee = {:invitee}", { household: household.id, invitee: user })
  return e.noContent(204)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/household/leave", (e) => {
  var glue = require(`${__hooks}/glue/households.js`)
  var rules = require(`${__hooks}/lib/households.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var household = glue.of(e.app, e.auth.id)
  var left = rules.leave(glue.plain(household), e.auth.id)
  glue.check(left)
  if (left.close) {
    glue.unshare(e.app, household.id, "")
    e.app.delete(household)
  }
  else {
    household.set("members", left.members)
    e.app.save(household)
    glue.unshare(e.app, household.id, e.auth.id)
  }
  return e.noContent(204)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/household/accounts/{id}/share", (e) => {
  var glue = require(`${__hooks}/glue/households.js`)
  var rules = require(`${__hooks}/lib/households.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var household = glue.of(e.app, e.auth.id)
  glue.check(rules.ownerOnly(glue.plain(household), e.auth.id))
  var account = null
  try {
    account = e.app.findRecordById("accounts", e.request.pathValue("id"))
  }
  catch (_) {
    /* not found: the same answer as someone else's */
  }
  if (!account || account.getString("owner") !== e.auth.id) throw new NotFoundError("That account isn't there.")
  var shared = (e.requestInfo().body || {}).shared
  glue.check(rules.share(shared, (household.get("members") || []).length))
  account.set("shared_household", shared ? household.id : "")
  e.app.save(account)
  return e.json(200, { shared: shared })
}, $apis.requireAuth("users"))

// A person who deletes their account takes their households with them (each
// shared account of theirs stops being shared first), leaves any other one,
// and every invitation to or from them goes.
onRecordDelete((e) => {
  if (e.record.collection().name === "users") {
    var rules = require(`${__hooks}/lib/households.js`)
    var user = e.record.id
    e.app.findRecordsByFilter("households", "owner = {:user}", "", 0, 0, { user: user }).forEach(function (household) {
      e.app.findRecordsByFilter("accounts", "shared_household = {:household}", "", 0, 0, { household: household.id }).forEach(function (account) {
        account.set("shared_household", "")
        e.app.save(account)
      })
      e.app.delete(household)
    })
    e.app.findRecordsByFilter("households", "members.id ?= {:user}", "", 0, 0, { user: user }).forEach(function (household) {
      if (household.getString("owner") === user) return
      household.set("members", rules.without(household.get("members"), user))
      e.app.save(household)
    })
    require(`${__hooks}/glue/households.js`).deleteInvites(e.app, "invitee = {:user} || invited_by = {:user}", { user: user })
  }
  e.next()
}, "users")
