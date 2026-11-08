# Migrations

Cheddar's schema (every PocketBase collection, field, rule and index) is
changed only by the files here, which `scripts/migrate.mjs` applies as a
PocketBase superuser. PocketBase itself applies nothing: it runs with
`--automigrate=false` and has no migrations folder.

Where it runs:

- **Cluster:** the `migrate` init container of the web pod
  (`k8s/app/nuxt.yaml`), so a new version never serves before its schema
  exists. If a migration fails, the new pod doesn't start and the old one
  keeps serving.
- **CI:** once the integration job's PocketBase is up.
- **Your machine:** `pnpm run setup` runs it, and so does `pnpm migrate`.

Each file is `NNNN_what_it_does.mjs`. They run in name order, and each one
that ran is recorded by name in the `schema_migrations` collection, which
only a superuser can read.

## Writing one

```js
// Accounts get an optional institution name, shown under the account's own.
export default async function up(pb) {
  const accounts = await pb.collection('accounts')
  if (accounts.fields.some(f => f.name === 'institution')) return
  accounts.fields.push({ name: 'institution', type: 'text', max: 100 })
  await pb.send('PATCH', '/api/collections/accounts', { fields: accounts.fields })
}
```

`pb.send(method, path, body)` calls PocketBase's API as the superuser.
`pb.collection(name)` returns a collection (or null), and `pb.collections()`
returns all of them.

- **Never rename or delete an applied file.** The name is its identity.
- **Make it safe to run twice.** A migration that fails halfway runs again
  from the top next time: check before you add, as above.
- **Send the whole `fields` list** when you change a collection's fields.
  PocketBase removes any field the list leaves out, and the data in it.
- **Address collections by name**, never by their generated id.
- **Every collection holding someone's data is theirs alone, and only with
  two-step sign-in on.** Each of its rules reads
  `owner = @request.auth.id && @request.auth.mfa_enabled = true` (create:
  `@request.body.owner = @request.auth.id && …`); `tests/api/` proves that
  another person's token, and a password-only session, see nothing.
- **Open with a comment saying what changes and why.** For a rule, say what
  it stops someone doing.
- **No `down`.** To undo a migration, write a new one.
- **Never change the schema in the admin UI.** The next deploy wouldn't know.
