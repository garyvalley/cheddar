// Matching transfers and refunds (shared/links.ts, issue #110). On
// `transactions`:
//   - `link` is the other transaction of a matched pair: the other side of
//     a transfer between the person's own accounts, or a refund's purchase
//     (and the purchase's refund).
//   - `link_kind` is transfer or refund.
//   - `link_checked` says the hooks have tried to match it; the hooks'
//     backfill tries the rest a few thousand at a time.
//   - `link_off` says the person unlinked it, so it's never matched again.
// `category_by` gains `link`: sorted by its match (a transfer as Transfers,
// a refund into its purchase's category).
// Only the hooks write these (pb_hooks/links.pb.js drops the record API's
// writes), so the update rule needs no change.

export default async function up(pb) {
  const tx = await pb.collection('transactions')
  const fields = tx.fields.map(f => (f.name === 'category_by' && !f.values.includes('link') ? { ...f, values: [...f.values, 'link'] } : f))
  const have = new Set(fields.map(f => f.name))
  if (!have.has('link')) fields.push({ name: 'link', type: 'relation', collectionId: tx.id, maxSelect: 1, cascadeDelete: false })
  if (!have.has('link_kind')) fields.push({ name: 'link_kind', type: 'select', maxSelect: 1, values: ['transfer', 'refund'] })
  if (!have.has('link_checked')) fields.push({ name: 'link_checked', type: 'bool' })
  if (!have.has('link_off')) fields.push({ name: 'link_off', type: 'bool' })
  const indexes = [...tx.indexes]
  if (!indexes.some(i => i.includes('idx_transactions_link_checked'))) indexes.push('CREATE INDEX idx_transactions_link_checked ON transactions (link_checked)')
  await pb.send('PATCH', '/api/collections/transactions', { fields, indexes })
}
