/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Spending categories (lib/categories.js says how one is chosen). Every
// transaction is sorted as it's saved, whichever way it arrives: a statement
// import through the record API, or a bank sync through glue/plaid.js.
//
//   POST /api/transactions/{id}/category  { category } -> { transaction, moved }
//     The person moves a transaction to another category. It stays there,
//     and the merchant's other transactions, and its next ones, follow
//     (glue/categories.js). `moved` is how many others changed. `category`
//     is a built-in id or one of the person's own ("c-...").
//
//   GET  /api/categories                  -> { categories: [{ id, label, spending, custom }] }
//   POST /api/categories                  { name } -> { category }: a category of the person's own
//   POST /api/categories/{id}/rename      { name } -> { category }
//   POST /api/categories/{id}/remove      -> { resorted }: its transactions are sorted again on their own
//
// A person's own categories count as spending, and their rules work just as
// the built-in ones' do.
//
// Only these hooks write a transaction's category, so no client can mark one
// as chosen by hand and no rule is ever overwritten unseen. Rules live in
// `category_rules`, which only the hooks read (migrations/0006_categories.mjs).
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) ["category", "category_by", "merchant_key", "bank_category"].forEach(function (f) { e.record.set(f, "") })
  e.next()
}, "transactions")

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    var original = e.record.original()
    var fields = ["category", "category_by", "merchant_key", "bank_category"]
    fields.forEach(function (f) { e.record.set(f, original.getString(f)) })
  }
  e.next()
}, "transactions")

onRecordCreate((e) => {
  require(`${__hooks}/glue/categories.js`).sort(e.app, e.record)
  e.next()
}, "transactions")

onRecordUpdate((e) => {
  require(`${__hooks}/glue/categories.js`).sort(e.app, e.record)
  e.next()
}, "transactions")

routerAdd("POST", "/api/transactions/{id}/category", (e) => {
  var glue = require(`${__hooks}/glue/categories.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var category = String((e.requestInfo().body || {}).category || "")
  if (!glue.usable(e.app, e.auth.id, category)) throw new BadRequestError("Choose one of the categories.")
  var rec = null
  try {
    rec = e.app.findRecordById("transactions", e.request.pathValue("id"))
  }
  catch (_) { /* not found: the same answer as someone else's */ }
  if (!rec || rec.getString("owner") !== e.auth.id) throw new NotFoundError("That transaction isn't there.")
  var moved = glue.recategorize(e.app, rec, category)
  return e.json(200, {
    transaction: { id: rec.id, category: rec.getString("category"), category_by: rec.getString("category_by") },
    moved: moved,
  })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/categories", (e) => {
  var glue = require(`${__hooks}/glue/categories.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  return e.json(200, { categories: glue.list(e.app, e.auth.id) })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/categories", (e) => {
  var glue = require(`${__hooks}/glue/categories.js`)
  var cats = require(`${__hooks}/lib/categories.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var name = cats.cleanName((e.requestInfo().body || {}).name)
  if (!name) throw new BadRequestError("Give the category a name of up to 40 characters.")
  if (glue.nameTaken(e.app, e.auth.id, name, "")) throw new BadRequestError("You already have a category called " + name + ".")
  if (e.app.countRecords("custom_categories", $dbx.hashExp({ owner: e.auth.id })) >= 100) {
    throw new BadRequestError("That's as many categories of your own as one account can have. Delete one first.")
  }
  var rec = new Record(e.app.findCollectionByNameOrId("custom_categories"))
  rec.set("owner", e.auth.id)
  rec.set("name", name)
  e.app.save(rec)
  return e.json(200, { category: { id: "c-" + rec.id, label: name, spending: true, custom: true } })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/categories/{id}/rename", (e) => {
  var glue = require(`${__hooks}/glue/categories.js`)
  var cats = require(`${__hooks}/lib/categories.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var id = e.request.pathValue("id")
  var rec = glue.customOf(e.app, e.auth.id, id)
  if (!rec) throw new NotFoundError("That category isn't there.")
  var name = cats.cleanName((e.requestInfo().body || {}).name)
  if (!name) throw new BadRequestError("Give the category a name of up to 40 characters.")
  if (glue.nameTaken(e.app, e.auth.id, name, id)) throw new BadRequestError("You already have a category called " + name + ".")
  rec.set("name", name)
  e.app.save(rec)
  return e.json(200, { category: { id: id, label: name, spending: true, custom: true } })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/categories/{id}/remove", (e) => {
  var glue = require(`${__hooks}/glue/categories.js`)
  if (!e.auth.getBool("mfa_enabled")) throw new ForbiddenError("Turn on two-step sign-in first.")
  var rec = glue.customOf(e.app, e.auth.id, e.request.pathValue("id"))
  if (!rec) throw new NotFoundError("That category isn't there.")
  return e.json(200, { resorted: glue.remove(e.app, e.auth.id, rec) })
}, $apis.requireAuth("users"))

// Transactions saved before categories existed, or while an older version
// of these hooks ran: a few thousand at a time until none is left.
cronAdd("categories_backfill", "*/5 * * * *", () => {
  var rows
  try {
    rows = $app.findRecordsByFilter("transactions", "category_by = '' || category = ''", "", 2000, 0)
  }
  catch (err) {
    console.log("[categories] backfill skipped: " + err)
    return
  }
  rows.forEach(function (rec) {
    try {
      $app.save(rec)
    }
    catch (err) {
      console.log("[categories] couldn't sort " + rec.id + ": " + err)
    }
  })
  if (rows.length) console.log("[categories] sorted " + rows.length + " transactions")
})
