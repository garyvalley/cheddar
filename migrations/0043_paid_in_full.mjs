// A credit card paid in full each month (shared/projections.ts): Projections
// leaves it out of paying off debt. `accounts.paid_in_full` is the person's
// word, 'yes' or 'no'; empty lets Cheddar tell from the card's payments
// (paysInFull()). Only a card has one (checkAccountChange() in
// shared/accounts.ts). The accounts rules already let only the owner change it.
export default async function up(pb) {
  const accounts = await pb.collection('accounts')
  if (accounts.fields.some(f => f.name === 'paid_in_full')) return
  await pb.send('PATCH', '/api/collections/accounts', {
    fields: [...accounts.fields, { name: 'paid_in_full', type: 'select', maxSelect: 1, values: ['yes', 'no'] }],
  })
}
