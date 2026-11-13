// Accounts can be closed and left out (issue #25).
//
// `closed_on` (YYYY-MM-DD, empty while open): a paid-off loan or a cancelled
// card. Its transactions stay in past months' Spending and Taxes; from that
// day on it holds nothing, so it leaves net worth without the history going.
//
// `excluded`: an account no page counts, such as one account of a linked
// bank the person doesn't want in their numbers (a joint account, the
// mortgage). A linked one keeps syncing, so counting it again is instant;
// deleting it instead would only bring it back on the next sync.
//
// Both are the owner's to set, through the accounts rules as they stand.

const DATE = '^\\d{4}-\\d{2}-\\d{2}$'

export default async function up(pb) {
  const accounts = await pb.collection('accounts')
  const fields = [...accounts.fields]
  if (!fields.some(f => f.name === 'closed_on')) fields.push({ name: 'closed_on', type: 'text', max: 10, pattern: DATE })
  if (!fields.some(f => f.name === 'excluded')) fields.push({ name: 'excluded', type: 'bool' })
  if (fields.length === accounts.fields.length) return
  await pb.send('PATCH', '/api/collections/accounts', { fields })
}
