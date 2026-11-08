// Bank links move from SimpleFIN to Plaid: the person signs in to their bank
// in Plaid Link, and the link keeps Plaid's access token (encrypted, in
// `access`, as before) instead of a SimpleFIN access URL.
//
// No SimpleFIN link can carry over -- a SimpleFIN access URL means nothing
// to Plaid -- so any there are go. Their accounts and transactions stay, as
// accounts that no longer sync, as when a person removes a link.
//
// `item_id` is Plaid's id for the link; `cursor` is where the next
// /transactions/sync carries on from. Every rule stays null: only the hooks
// read or write a link.

export default async function up(pb) {
  const links = await pb.collection('bank_links')

  const old = await pb.send('GET', `/api/collections/bank_links/records?perPage=500&filter=${encodeURIComponent('provider != \'plaid\'')}`)
  for (const link of old.items) {
    const accounts = await pb.send('GET', `/api/collections/accounts/records?perPage=500&filter=${encodeURIComponent(`link = '${link.id}'`)}`)
    for (const a of accounts.items) await pb.send('PATCH', `/api/collections/accounts/records/${a.id}`, { link: '' })
    await pb.send('DELETE', `/api/collections/bank_links/records/${link.id}`)
  }

  const fields = links.fields.map(f => (f.name === 'provider' ? { ...f, values: ['plaid'] } : f))
  const have = new Set(fields.map(f => f.name))
  if (!have.has('item_id')) fields.push({ name: 'item_id', type: 'text', max: 200 })
  if (!have.has('cursor')) fields.push({ name: 'cursor', type: 'text', max: 2000, hidden: true })
  await pb.send('PATCH', '/api/collections/bank_links', { fields })
}
