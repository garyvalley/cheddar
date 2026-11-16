// Which Terms of Use each person agreed to (shared/legal.ts TERMS_VERSION,
// a date) and when, in ms. Set only through pb_hooks/terms.pb.js: sign-up
// must carry the current version, a later change may only move to it, and
// the hook stamps terms_agreed itself. Empty for accounts made before the
// terms existed: they're asked at their next visit.

export default async function up(pb) {
  const users = await pb.collection('users')
  const have = new Set(users.fields.map(f => f.name))
  const fields = [...users.fields]
  if (!have.has('terms_version')) fields.push({ name: 'terms_version', type: 'text', max: 32 })
  if (!have.has('terms_agreed')) fields.push({ name: 'terms_agreed', type: 'number', onlyInt: true })
  if (fields.length !== users.fields.length) await pb.send('PATCH', '/api/collections/users', { fields })
}
