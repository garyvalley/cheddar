// Home and car values that change at a yearly rate (shared/property.ts,
// issue #113): `accounts.yearly_change_bp`, in basis points (300 = +3% a
// year, -1500 = -15%), 0 for none. pb_hooks/property.pb.js moves a
// property account's balance on each day by it.
export default async function up(pb) {
  const accounts = await pb.collection('accounts')
  if (accounts.fields.some(f => f.name === 'yearly_change_bp')) return
  await pb.send('PATCH', '/api/collections/accounts', {
    fields: [...accounts.fields, { name: 'yearly_change_bp', type: 'number', onlyInt: true, min: -5000, max: 5000 }],
  })
}
