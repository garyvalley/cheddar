// `balance_history`: the balance each account showed on each day Cheddar saw
// one, so Overview can say how net worth and the investment accounts have
// changed (shared/overview.ts). An account keeps only its latest balance, and
// an investment account's growth is in its balance, not its transactions.
//
// pb_hooks/balances.pb.js writes a row whenever an account's balance is set
// (a bank sync, or a person entering it on Accounts): one per account per
// day, the day's last balance. Nobody writes one through the record API, so
// a row is always what the account really showed. The owner reads their own,
// with two-step sign-in on; rows go with their account.
//
// Accounts that already have a balance start their history with it.

const MINE = 'owner = @request.auth.id && @request.auth.mfa_enabled = true'

export default async function up(pb) {
  if (!await pb.collection('balance_history')) {
    const users = await pb.collection('users')
    const accounts = await pb.collection('accounts')
    await pb.send('POST', '/api/collections', {
      name: 'balance_history',
      type: 'base',
      listRule: MINE,
      viewRule: MINE,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'account', type: 'relation', collectionId: accounts.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'date', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        // Signed, as on the account: what a liability owes is negative.
        { name: 'balance_cents', type: 'number', onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_balance_history_day ON balance_history (account, date)',
        'CREATE INDEX idx_balance_history_owner ON balance_history (owner, date)',
      ],
    })
  }

  for (let page = 1; ; page++) {
    const list = await pb.send('GET', `/api/collections/accounts/records?perPage=500&page=${page}&filter=${encodeURIComponent('balance_date != \'\'')}`)
    for (const a of list.items) {
      const have = await pb.send('GET', `/api/collections/balance_history/records?perPage=1&filter=${encodeURIComponent(`account = '${a.id}' && date = '${a.balance_date}'`)}`)
      if (have.items.length) continue
      await pb.send('POST', '/api/collections/balance_history/records', { owner: a.owner, account: a.id, date: a.balance_date, balance_cents: a.balance_cents ?? 0 })
    }
    if (page >= list.totalPages) break
  }
}
