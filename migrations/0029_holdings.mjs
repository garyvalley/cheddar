// Investment holdings (issue #90): what a linked brokerage or retirement
// account holds, one row per position, as its bank last reported it through
// the provider (Plaid's Investments product, on only with
// PLAID_INVESTMENTS=true). Written only by the sync (pb_hooks/glue/bank_links.js),
// so every write rule is null; each person reads only their own, and only
// with two-step sign-in on. `bank_links.holdings` says why a link has none:
// "" (not asked), ok, consent (sign in to the bank again to share them),
// unsupported (the bank doesn't offer them).
const MINE = 'owner = @request.auth.id && @request.auth.mfa_enabled = true'

export default async function up(pb) {
  const links = await pb.collection('bank_links')
  if (!links.fields.some(f => f.name === 'holdings')) {
    await pb.send('PATCH', '/api/collections/bank_links', {
      fields: [...links.fields, { name: 'holdings', type: 'text', max: 20 }],
    })
  }
  if (await pb.collection('holdings')) return
  const users = await pb.collection('users')
  const accounts = await pb.collection('accounts')
  await pb.send('POST', '/api/collections', {
    name: 'holdings',
    type: 'base',
    listRule: MINE,
    viewRule: MINE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'account', type: 'relation', collectionId: accounts.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'name', type: 'text', max: 200 },
      { name: 'ticker', type: 'text', max: 20 },
      // equity, etf, mutual fund, fixed income, cash, derivative, cryptocurrency, other
      { name: 'type', type: 'text', max: 30 },
      { name: 'quantity', type: 'number' },
      { name: 'price_cents', type: 'number', onlyInt: true },
      { name: 'value_cents', type: 'number', onlyInt: true },
      // 0 when the bank doesn't say (PocketBase keeps no null numbers).
      { name: 'cost_basis_cents', type: 'number', onlyInt: true },
      { name: 'currency', type: 'text', max: 3 },
      // The day the bank's price is from (YYYY-MM-DD), or ''.
      { name: 'price_as_of', type: 'text', max: 10 },
      // When Cheddar fetched it.
      { name: 'as_of', type: 'date' },
    ],
    indexes: ['CREATE INDEX idx_holdings_owner_account ON holdings (owner, account)'],
  })
}
