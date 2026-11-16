/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Tags on transactions (shared/tags.ts). Nuxt's PATCH /api/transactions/:id
// writes them as the person (the owner, or a member of the household the
// account is shared with). Whatever writes them through the record API,
// they're checked and tidied here (checkTags() in lib/gen/tags.js). A bank
// sync and a statement import never touch them.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var lib = require(`${__hooks}/lib/gen/tags.js`)
    var raw = e.record.getString("tags")
    var value
    try {
      value = raw === "" || raw === "null" ? null : JSON.parse(raw)
    }
    catch (_) {
      throw new BadRequestError("Tags are a list of words.")
    }
    var r = lib.checkTags(value)
    if (r.problem) throw new BadRequestError(r.problem)
    e.record.set("tags", r.tags)
  }
  e.next()
}, "transactions")

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var now = e.record.getString("tags")
    if (now !== e.record.original().getString("tags")) {
      var lib = require(`${__hooks}/lib/gen/tags.js`)
      var value
      try {
        value = now === "" || now === "null" ? null : JSON.parse(now)
      }
      catch (_) {
        throw new BadRequestError("Tags are a list of words.")
      }
      var r = lib.checkTags(value)
      if (r.problem) throw new BadRequestError(r.problem)
      e.record.set("tags", r.tags)
    }
  }
  e.next()
}, "transactions")
