// Investments' past (issue #144), both from Plaid Investments
// (PLAID_INVESTMENTS=true), written only by the sync
// (pb_hooks/glue/sync_holdings.js), so every write rule is null; each person
// reads only their own, with two-step sign-in on.
//
// holding_history: what each brokerage or retirement account held, one row
// per security per day the link synced (the person's day). `security` is
// lib/investing.js securityKey(): the ticker, or the name, the same each day.
//
// investment_activity: buys, sells, dividends, interest, deposits,
// withdrawals and fees (lib/plaid.js activityRows), one row per activity,
// by the bank's id. Kept apart from transactions, so it never counts as
// spending or income. `amount_cents` is the cash it moved into the account.
const MINE = 'owner = @request.auth.id && @request.auth.mfa_enabled = true'
const DAY = { type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' }

export default async function up(pb) {
  const users = await pb.collection('users')
  const accounts = await pb.collection('accounts')
  const base = () => [
    { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
    { name: 'account', type: 'relation', collectionId: accounts.id, maxSelect: 1, required: true, cascadeDelete: true },
  ]
  const stamps = () => [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
  ]
  const rules = { listRule: MINE, viewRule: MINE, createRule: null, updateRule: null, deleteRule: null }
  if (!(await pb.collection('holding_history'))) {
    await pb.send('POST', '/api/collections', {
      name: 'holding_history',
      type: 'base',
      ...rules,
      fields: [
        ...base(),
        { name: 'date', ...DAY },
        { name: 'security', type: 'text', required: true, max: 200 },
        { name: 'name', type: 'text', max: 200 },
        { name: 'ticker', type: 'text', max: 20 },
        { name: 'type', type: 'text', max: 30 },
        { name: 'quantity', type: 'number' },
        // 0 when the bank gives no price (PocketBase keeps no null numbers).
        { name: 'price_cents', type: 'number', onlyInt: true },
        { name: 'value_cents', type: 'number', onlyInt: true },
        ...stamps(),
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_holding_history_day ON holding_history (account, date, security)',
        'CREATE INDEX idx_holding_history_owner ON holding_history (owner, date)',
      ],
    })
  }
  if (!(await pb.collection('investment_activity'))) {
    await pb.send('POST', '/api/collections', {
      name: 'investment_activity',
      type: 'base',
      ...rules,
      fields: [
        ...base(),
        { name: 'external_id', type: 'text', required: true, max: 200 },
        { name: 'date', ...DAY },
        // buy, sell, dividend, interest, deposit, withdrawal, fee, other
        { name: 'kind', type: 'text', max: 20 },
        { name: 'name', type: 'text', max: 200 },
        { name: 'security', type: 'text', max: 200 },
        { name: 'ticker', type: 'text', max: 20 },
        { name: 'quantity', type: 'number' },
        { name: 'price_cents', type: 'number', onlyInt: true },
        { name: 'amount_cents', type: 'number', onlyInt: true },
        { name: 'fees_cents', type: 'number', onlyInt: true },
        ...stamps(),
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_investment_activity_id ON investment_activity (account, external_id)',
        'CREATE INDEX idx_investment_activity_owner ON investment_activity (owner, date)',
      ],
    })
  }
}
