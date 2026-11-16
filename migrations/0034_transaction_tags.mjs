// Tags on transactions (shared/tags.ts, issue #106): a few words a person
// puts on a transaction across categories, kept on it as a JSON list (or
// null). pb_hooks/tags.pb.js checks every record-API write. The update rule
// (migrations/0021) locks named fields for household members and leaves
// the rest, so a member may tag a shared transaction, as with its note.

export default async function up(pb) {
  const tx = await pb.collection('transactions')
  if (tx.fields.some(f => f.name === 'tags')) return
  tx.fields.push({ name: 'tags', type: 'json', maxSize: 2000 })
  await pb.send('PATCH', '/api/collections/transactions', { fields: tx.fields })
}
