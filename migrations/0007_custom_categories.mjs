// Categories of a person's own (pb_hooks/categories.pb.js): made, renamed
// and deleted on Spending, chosen for a transaction like a built-in one, and
// remembered for the merchant the same way. A transaction or rule names one
// as "c-" and its id here.
//
// Every rule is null, as for category_rules: only the hooks read or write
// it, on routes that act for the signed-in person alone, so nobody can
// name a category into someone else's list.

export default async function up(pb) {
  if (await pb.collection('custom_categories')) return
  const users = await pb.collection('users')
  await pb.send('POST', '/api/collections', {
    name: 'custom_categories',
    type: 'base',
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 40 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_custom_categories_name ON custom_categories (owner, name COLLATE NOCASE)'],
  })
}
