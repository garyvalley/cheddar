// ---------------------------------------------------------------------------
// The household rules (pb_hooks/households.pb.js): who may invite, accept,
// remove, leave and share, and what each step leaves the member list as.
// Pure: plain values in, and either what to save or a refusal out, as
// { problem, status } (400, 403 or 404). pb_hooks/glue/households.js reads
// and saves the records; tests/households.test.mjs covers these.
// ---------------------------------------------------------------------------

/** The most people a household holds, its owner included. */
var MAX_MEMBERS = 20
var NAME_MAX = 60
var EMAIL_MAX = 254

var ALREADY_IN = "You already belong to a household."
var OWNER_ONLY = "Only the household owner can do that."
var NOT_AVAILABLE = "That verified Cheddar account isn't available to invite."
var CLOSE_FIRST = "Remove other members before closing the household."

function refuse(status, problem) {
  return { status: status, problem: problem }
}

/** A new household's name, trimmed, or a refusal; refused too when `inOne` (the caller already belongs to one). */
function newHousehold(name, inOne) {
  if (inOne) return refuse(400, ALREADY_IN)
  var n = String(name || "").trim()
  if (!n || n.length > NAME_MAX) return refuse(400, "Give the household a name of up to 60 characters.")
  return { name: n }
}

/** Refused unless `caller` owns `household` ({ owner }); a missing household is a 404. */
function ownerOnly(household, caller) {
  if (!household) return refuse(404, "That household isn't there.")
  if (household.owner !== caller) return refuse(403, OWNER_ONLY)
  return null
}

/** The address to invite, lower case, or a refusal. */
function inviteEmail(email) {
  var e = String(email || "").trim().toLowerCase()
  if (!e || e.length > EMAIL_MAX) return refuse(400, "Enter the email of an existing Cheddar account.")
  return { email: e }
}

/**
 * Whether `invitee` ({ id, verified, inHousehold }, or null when no account
 * has the address) may be invited by `caller`. Every reason it can't gets the
 * same answer, so an invite never tells whether an address has an account.
 * `pending`: an invitation to this household is already waiting for them.
 */
function canInvite(invitee, caller, pending) {
  if (!invitee || !invitee.verified || invitee.id === caller || invitee.inHousehold) return refuse(400, NOT_AVAILABLE)
  if (pending) return refuse(400, "An invitation is already waiting for that person.")
  return null
}

/** The members once `caller` accepts an invitation, or a refusal (already in one, or the household is full). */
function accept(members, caller, inOne) {
  if (inOne) return refuse(400, ALREADY_IN)
  var list = (members || []).slice()
  if (list.length >= MAX_MEMBERS) return refuse(400, "That household has reached its member limit.")
  list.push(caller)
  return { members: list }
}

/** `members` without `id`. */
function without(members, id) {
  return (members || []).filter(function (m) {
    return m !== id
  })
}

/** The members once the owner (`caller`) removes `target`, or a refusal. */
function removeMember(household, caller, target) {
  var no = ownerOnly(household, caller)
  if (no) return no
  if (target === caller) return refuse(400, CLOSE_FIRST)
  if ((household.members || []).indexOf(target) === -1) return refuse(404, "That household member isn't there.")
  return { members: without(household.members, target) }
}

/**
 * What `caller` leaving does: the owner closes it ({ close: true }), only
 * once nobody else is in it; anyone else leaves ({ members }).
 */
function leave(household, caller) {
  if (!household) return refuse(404, "That household isn't there.")
  var members = household.members || []
  if (household.owner === caller) {
    if (members.length > 1) return refuse(400, CLOSE_FIRST)
    return { close: true }
  }
  return { members: without(members, caller) }
}

/** Whether the owner may share (`shared` true) or stop sharing an account with a household of `memberCount`. */
function share(shared, memberCount) {
  if (typeof shared !== "boolean") return refuse(400, "Say whether to share this account.")
  if (shared && memberCount < 2) return refuse(400, "Invite a household member before sharing an account.")
  return null
}

module.exports = {
  MAX_MEMBERS: MAX_MEMBERS,
  newHousehold: newHousehold,
  ownerOnly: ownerOnly,
  inviteEmail: inviteEmail,
  canInvite: canInvite,
  accept: accept,
  without: without,
  removeMember: removeMember,
  leave: leave,
  share: share,
}
