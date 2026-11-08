// Money: `accounts` (a checking account, a card, a loan...), the
// `transactions` in them, and the `imports` (statement files) that brought
// transactions in. File imports (server/api/imports/) and bank connections
// share these collections: each transaction says where it came from
// (`source`), and `external_id` -- unique within an account -- is what makes a
// re-import or a re-sync skip what is already there.
//
// Every row is its owner's alone, and only with two-step sign-in on. The
// create and update rules also refuse a transaction or import that points at
// someone else's account, so nobody can write into another person's books
// even by guessing an id. Money is whole cents and dates are YYYY-MM-DD
// text, so a total never drifts and a statement date never moves a day for a
// timezone.
//
// It also turns on PocketBase's batch API, which an import uses to add a
// statement's transactions in a few requests rather than one per row. A batch
// runs each create through the same collection rules.

const DATE = '^\\d{4}-\\d{2}-\\d{2}$'
const MINE = 'owner = @request.auth.id && @request.auth.mfa_enabled = true'
const CREATE_MINE = '@request.body.owner = @request.auth.id && @request.auth.mfa_enabled = true'
// The row's account (as submitted, or as it stays) is the caller's own.
const IN_MY_ACCOUNT = 'account.owner = @request.auth.id'
// An update may not hand a row to someone else.
const KEEPS_OWNER = '(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)'

const ownerField = users => ({
  name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true,
})
const autodates = [
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]

export default async function up(pb) {
  const users = await pb.collection('users')

  if (!await pb.collection('accounts')) {
    await pb.send('POST', '/api/collections', {
      name: 'accounts',
      type: 'base',
      listRule: MINE,
      viewRule: MINE,
      createRule: CREATE_MINE,
      updateRule: `${MINE} && ${KEEPS_OWNER}`,
      deleteRule: MINE,
      fields: [
        ownerField(users),
        { name: 'name', type: 'text', required: true, max: 100 },
        { name: 'kind', type: 'select', required: true, maxSelect: 1,
          values: ['checking', 'savings', 'credit_card', 'brokerage', 'retirement', 'loan', 'property', 'other'] },
        { name: 'institution', type: 'text', max: 100 },
        // The last four digits of the account number, to tell two cards apart.
        { name: 'last4', type: 'text', max: 4, pattern: '^\\d{4}$' },
        // ISO 4217; the app writes USD when none is given.
        { name: 'currency', type: 'text', max: 3, pattern: '^[A-Z]{3}$' },
        // Signed: what a liability (a card, a loan) owes is negative.
        { name: 'balance_cents', type: 'number', onlyInt: true },
        { name: 'balance_date', type: 'text', max: 10, pattern: DATE },
        { name: 'source', type: 'select', maxSelect: 1, values: ['manual', 'import', 'sync'] },
        // A bank connection's own id for the account; empty for one made by hand.
        { name: 'external_id', type: 'text', max: 200 },
        ...autodates,
      ],
      indexes: [
        'CREATE INDEX idx_accounts_owner ON accounts (owner)',
        "CREATE UNIQUE INDEX idx_accounts_external ON accounts (owner, external_id) WHERE external_id != ''",
      ],
    })
  }
  const accounts = await pb.collection('accounts')

  if (!await pb.collection('imports')) {
    await pb.send('POST', '/api/collections', {
      name: 'imports',
      type: 'base',
      listRule: MINE,
      viewRule: MINE,
      createRule: `${CREATE_MINE} && ${IN_MY_ACCOUNT}`,
      // Written once; deleting one takes its transactions with it (undo).
      updateRule: null,
      deleteRule: MINE,
      fields: [
        ownerField(users),
        { name: 'account', type: 'relation', collectionId: accounts.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'filename', type: 'text', max: 200 },
        { name: 'format', type: 'select', required: true, maxSelect: 1, values: ['csv', 'ofx'] },
        { name: 'added', type: 'number', onlyInt: true, min: 0 },
        { name: 'skipped', type: 'number', onlyInt: true, min: 0 },
        // The earliest and latest dates in the file.
        { name: 'first_date', type: 'text', max: 10, pattern: DATE },
        { name: 'last_date', type: 'text', max: 10, pattern: DATE },
        ...autodates,
      ],
      indexes: ['CREATE INDEX idx_imports_account ON imports (account, created)'],
    })
  }
  const imports = await pb.collection('imports')

  if (!await pb.collection('transactions')) {
    await pb.send('POST', '/api/collections', {
      name: 'transactions',
      type: 'base',
      listRule: MINE,
      viewRule: MINE,
      createRule: `${CREATE_MINE} && ${IN_MY_ACCOUNT}`,
      updateRule: `${MINE} && ${KEEPS_OWNER} && ${IN_MY_ACCOUNT}`,
      deleteRule: MINE,
      fields: [
        ownerField(users),
        { name: 'account', type: 'relation', collectionId: accounts.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'posted', type: 'text', required: true, max: 10, pattern: DATE },
        // Signed whole cents: money out is negative. Zero is allowed (a $0 fee reversal).
        { name: 'amount_cents', type: 'number', onlyInt: true },
        { name: 'description', type: 'text', max: 500 },
        { name: 'payee', type: 'text', max: 200 },
        { name: 'category', type: 'text', max: 100 },
        { name: 'pending', type: 'bool' },
        { name: 'source', type: 'select', required: true, maxSelect: 1, values: ['manual', 'import', 'sync'] },
        // What makes a row the same row next time: "fitid:<id>" from an OFX
        // file, "csv:<hash>" for a CSV row, a connection's own prefix for a sync.
        { name: 'external_id', type: 'text', max: 200 },
        // The file it came from; deleting the import deletes its rows.
        { name: 'import', type: 'relation', collectionId: imports.id, maxSelect: 1, cascadeDelete: true },
        ...autodates,
      ],
      indexes: [
        'CREATE INDEX idx_transactions_owner_posted ON transactions (owner, posted)',
        'CREATE INDEX idx_transactions_account_posted ON transactions (account, posted)',
        "CREATE UNIQUE INDEX idx_transactions_external ON transactions (account, external_id) WHERE external_id != ''",
      ],
    })
  }

  // 200 creates a request, a statement or two of rows at a time.
  await pb.send('PATCH', '/api/settings', { batch: { enabled: true, maxRequests: 200, timeout: 30, maxBodySize: 0 } })
}
