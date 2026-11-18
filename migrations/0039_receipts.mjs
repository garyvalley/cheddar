// Receipts on transactions (shared/receipts.ts, issue #113): a photo or a
// PDF kept with one of the person's own transactions, at full size, in
// PocketBase's file storage (pb_data/storage; G's choice), which
// k8s/backup/files.yaml backs up beside the database. The file is protected:
// it's served only with a file token, and Nuxt fetches it as the person
// (GET /api/receipts/:id). Theirs alone, with two-step sign-in on; never
// changed, only added or deleted. pb_hooks/receipts.pb.js counts them.
// Deleting the transaction, or the person, deletes them and their files.
const MINE = 'owner = @request.auth.id && @request.auth.mfa_enabled = true'

export default async function up(pb) {
  if (await pb.collection('receipts')) return
  const users = await pb.collection('users')
  const transactions = await pb.collection('transactions')
  await pb.send('POST', '/api/collections', {
    name: 'receipts',
    type: 'base',
    listRule: MINE,
    viewRule: MINE,
    createRule: '@request.body.owner = @request.auth.id && @request.auth.mfa_enabled = true && @request.body.transaction.owner = @request.auth.id',
    updateRule: null,
    deleteRule: MINE,
    fields: [
      { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'transaction', type: 'relation', collectionId: transactions.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'name', type: 'text', max: 100 },
      { name: 'type', type: 'text', required: true, max: 40 },
      {
        name: 'file',
        type: 'file',
        required: true,
        maxSelect: 1,
        maxSize: 10 * 1024 * 1024,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
        protected: true,
      },
      { name: 'size', type: 'number', onlyInt: true, min: 0 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: [
      'CREATE INDEX idx_receipts_transaction ON receipts (`transaction`)',
      'CREATE INDEX idx_receipts_owner ON receipts (owner)',
    ],
  })
}
