// `bank_links.webhook`: the address a link's provider sends its webhooks to
// (issue #36), so new transactions arrive within minutes instead of once a
// day, and "sign in again" shows as soon as the bank asks. A sync points a
// link made before webhooks (or at an old address) at the current one and
// notes it here (pb_hooks/glue/bank_links.js).

export default async function up(pb) {
  const links = await pb.collection('bank_links')
  if (links.fields.some(f => f.name === 'webhook')) return
  await pb.send('PATCH', '/api/collections/bank_links', {
    fields: [...links.fields, { name: 'webhook', type: 'text', max: 500 }],
  })
}
