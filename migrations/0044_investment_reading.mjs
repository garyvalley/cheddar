// Investments over time (shared/investment-history.ts): each piece of
// investment activity keeps its security's type (`security_type`,
// "derivative" for an option, as Plaid gives it) and the way it was read
// (`reading`, shared/investing.ts ACTIVITY_READING). Rows saved before this
// have reading 0, so the next sync asks Plaid for the last two years again
// and reads them anew: options' exercise, assignment and expiry, and
// reinvested dividends as buys. Written only by the sync, as before.
export default async function up(pb) {
  const activity = await pb.collection('investment_activity')
  const have = new Set(activity.fields.map(f => f.name))
  const add = [
    { name: 'security_type', type: 'text', max: 30 },
    { name: 'reading', type: 'number', onlyInt: true, min: 0 },
  ].filter(f => !have.has(f.name))
  if (!add.length) return
  await pb.send('PATCH', '/api/collections/investment_activity', { fields: [...activity.fields, ...add] })
}
