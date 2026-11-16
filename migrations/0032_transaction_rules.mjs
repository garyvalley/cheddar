// Rules people write for their transactions (Settings → Rules,
// shared/rules.ts): conditions (words in the description or payee, an
// amount's size, an account) and actions (a category, a new payee, leaving
// it out). Like `category_rules`, the merchant rules Cheddar learns, every
// rule is null: only pb_hooks/rules.pb.js and glue/categories.js read or
// write them, for the signed-in person alone.

export default async function up(pb) {
  if (await pb.collection('transaction_rules')) return
  const users = await pb.collection('users')
  const accounts = await pb.collection('accounts')
  await pb.send('POST', '/api/collections', {
    name: 'transaction_rules',
    type: 'base',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'text', type: 'text', max: 60 },
      // null for no limit, so a rule for $0.00 stays possible.
      { name: 'min_cents', type: 'json', maxSize: 32 },
      { name: 'max_cents', type: 'json', maxSize: 32 },
      // Deleting the account deletes its rules.
      { name: 'account', type: 'relation', collectionId: accounts.id, maxSelect: 1, cascadeDelete: true },
      { name: 'category', type: 'text', max: 40 },
      { name: 'rename', type: 'text', max: 100 },
      { name: 'exclude', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_transaction_rules_owner ON transaction_rules (owner, created)'],
  })
}
