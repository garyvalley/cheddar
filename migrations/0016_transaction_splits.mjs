// A transaction can be split across categories: a Costco trip that's part
// groceries and part household. `splits` holds the parts, each a category
// and its share of the amount ([{ category, amount_cents }], null when it
// isn't split), on the transaction itself, so it stays one row to imports,
// bank syncs and their overlap, and a sync that brings it up to date keeps
// them. pb_hooks/splits.pb.js checks every write to them (they must add up,
// in the person's own categories); the existing rules already keep each
// row its owner's.

export default async function up(pb) {
  const transactions = await pb.collection('transactions')
  if (transactions.fields.some(f => f.name === 'splits')) return
  await pb.send('PATCH', '/api/collections/transactions', { fields: [...transactions.fields, { name: 'splits', type: 'json', maxSize: 4000 }] })
}
