/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// users.terms_version and terms_agreed: the Terms of Use a person agreed to
// (shared/legal.ts, as lib/gen/legal.js) and when. A new account must agree
// to the current version, a change may only move to it, and the time is
// always this server's: the record API can't backdate or skip it. A
// superuser (the admin UI, `pnpm run setup`) is left alone; such an account
// is asked to agree at its next visit.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var legal = require(`${__hooks}/lib/gen/legal.js`)
    if (!legal.hasAgreed(e.record.getString("terms_version"))) {
      throw new BadRequestError("Agree to the Terms of Use and the Privacy Notice to create an account.")
    }
    e.record.set("terms_agreed", Date.now())
  }
  e.next()
}, "users")

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var legal = require(`${__hooks}/lib/gen/legal.js`)
    var before = e.record.original()
    var version = e.record.getString("terms_version")
    if (version !== before.getString("terms_version")) {
      if (!legal.hasAgreed(version)) throw new BadRequestError("Those aren't the current Terms of Use.")
      e.record.set("terms_agreed", Date.now())
    }
    else {
      e.record.set("terms_agreed", before.getInt("terms_agreed"))
    }
  }
  e.next()
}, "users")
