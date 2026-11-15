// Transactions get `history`: a bank sync sets it on the rows a new link
// brings in from long before it was made (shared/review.ts), which then stay
// out of the review inbox rather than making a years-long queue. Only the
// sync writes it (pb_hooks/review.pb.js drops the record API's writes).
//
// Links made before this get the same treatment for what they brought in:
// synced rows not yet reviewed, posted before the link's review start, are
// marked history. Rows a person already reviewed keep that. The 30 days are
// shared/review.ts's REVIEW_DAYS as of this migration (the web image holds no
// shared/, and a migration is a snapshot anyway).
const REVIEW_DAYS = 30
const reviewFrom = (created) => {
  const at = Date.parse(`${String(created).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(at) ? '' : new Date(at - REVIEW_DAYS * 86_400_000).toISOString().slice(0, 10)
}

export default async function up(pb) {
  const transactions = await pb.collection('transactions')
  if (!transactions.fields.some(f => f.name === 'history')) {
    await pb.send('PATCH', '/api/collections/transactions', {
      fields: [...transactions.fields, { name: 'history', type: 'bool' }],
    })
  }

  const links = await all(pb, 'bank_links', '', 'id,created')
  for (const link of links) {
    const from = reviewFrom(link.created)
    if (!from) continue
    const accounts = await all(pb, 'accounts', `link = '${link.id}'`, 'id')
    for (const account of accounts) {
      for (;;) {
        const filter = `account = '${account.id}' && source = 'sync' && reviewed = false && history = false && posted < '${from}'`
        const page = await pb.send('GET', `/api/collections/transactions/records?perPage=200&skipTotal=1&fields=id&filter=${encodeURIComponent(filter)}`)
        if (!page.items.length) break
        await pb.send('POST', '/api/batch', {
          requests: page.items.map(row => ({
            method: 'PATCH',
            url: `/api/collections/transactions/records/${encodeURIComponent(row.id)}`,
            body: { history: true },
          })),
        })
      }
    }
  }
}

async function all(pb, collection, filter, fields) {
  const rows = []
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ page: String(page), perPage: '200', fields, ...(filter ? { filter } : {}) })
    const r = await pb.send('GET', `/api/collections/${collection}/records?${q}`)
    rows.push(...r.items)
    if (page >= r.totalPages) return rows
  }
}
