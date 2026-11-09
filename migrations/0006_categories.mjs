// Spending categories (pb_hooks/categories.pb.js): each transaction gets one
// on its own, and moving one to another category teaches a rule for that
// merchant's next ones.
//
// On `transactions`:
//   - `category` (there since 0003) holds a category id from
//     pb_hooks/lib/categories.js.
//   - `category_by` says how it was chosen: bank (Plaid's category), match
//     (what the description says), default, rule (the person's rule for the
//     merchant) or person (set by hand). Only the hooks write these two, so
//     the hooks never overwrite a choice the person made.
//   - `merchant_key` is the merchant a rule matches; `bank_category` is
//     Plaid's own category, kept so a transaction can be sorted again.
//
// `category_rules` holds each person's learned rules, one per merchant.
// Every rule is null, as for bank_links: only the hooks read or write it,
// on routes that act for the signed-in person alone.
//
// Transactions already there are sorted by the hooks' backfill, which runs
// every few minutes until none is left without a category.

export default async function up(pb) {
  const users = await pb.collection('users')
  const tx = await pb.collection('transactions')
  const have = new Set(tx.fields.map(f => f.name))
  const fields = [...tx.fields]
  if (!have.has('category_by')) fields.push({ name: 'category_by', type: 'select', maxSelect: 1, values: ['bank', 'match', 'default', 'rule', 'person'] })
  if (!have.has('merchant_key')) fields.push({ name: 'merchant_key', type: 'text', max: 100 })
  if (!have.has('bank_category')) fields.push({ name: 'bank_category', type: 'text', max: 100 })
  const indexes = [...tx.indexes]
  if (!indexes.some(i => i.includes('idx_transactions_merchant'))) {
    indexes.push('CREATE INDEX idx_transactions_merchant ON transactions (owner, merchant_key)')
  }
  if (!indexes.some(i => i.includes('idx_transactions_category'))) {
    indexes.push('CREATE INDEX idx_transactions_category ON transactions (owner, category, posted)')
  }
  await pb.send('PATCH', '/api/collections/transactions', { fields, indexes })

  if (!await pb.collection('category_rules')) {
    await pb.send('POST', '/api/collections', {
      name: 'category_rules',
      type: 'base',
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        // transactions.merchant_key
        { name: 'merchant', type: 'text', required: true, max: 100 },
        { name: 'category', type: 'text', required: true, max: 40 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_category_rules_merchant ON category_rules (owner, merchant)'],
    })
  }
}
