// A transaction gets a `note` of the person's own, and an `excluded` flag
// that leaves it out of spending, Overview's months, Projections and Taxes
// (a reimbursed work expense, a one-off that skews a month) without moving
// it to a category that says something untrue about it. Both are the
// person's: a bank sync and a statement import never write them, so a sync
// can't undo either. The existing rules already keep each row its owner's.

export default async function up(pb) {
  const transactions = await pb.collection('transactions')
  const add = [
    { name: 'note', type: 'text', max: 1000 },
    { name: 'excluded', type: 'bool' },
  ].filter(f => !transactions.fields.some(g => g.name === f.name))
  if (!add.length) return
  await pb.send('PATCH', '/api/collections/transactions', { fields: [...transactions.fields, ...add] })
}
