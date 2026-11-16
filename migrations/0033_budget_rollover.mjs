// Budget rollover (shared/budgets.ts, issue #107): a budget can carry what
// each month left, or overspent, into the next. `rollover_from` is the
// first month whose leftover carries (YYYY-MM), set when it's turned on.
// The collection's rules are unchanged: each person's own.

export default async function up(pb) {
  const budgets = await pb.collection('budgets')
  if (budgets.fields.some(f => f.name === 'rollover')) return
  budgets.fields.push(
    { name: 'rollover', type: 'bool' },
    { name: 'rollover_from', type: 'text', max: 7, pattern: '^(\\d{4}-(0[1-9]|1[0-2]))?$' },
  )
  await pb.send('PATCH', '/api/collections/budgets', { fields: budgets.fields })
}
