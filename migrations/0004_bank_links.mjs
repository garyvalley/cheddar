// Bank links: a person's SimpleFIN access (pb_hooks/bank_links.pb.js), and
// which link each synced account came from.
//
// `bank_links` holds the access URL, which reads every account it covers, so
// no one reaches it through the record API: every rule is null and only the
// hooks read or write it, encrypted with BANK_LINK_KEY. The hooks' own routes
// check that the caller owns the link and has two-step sign-in on.
//
// `accounts.link` is the link an account syncs from; empty for one made by
// hand or by a file import. The hooks set it, and the record API can't, so a
// person can't point an account at a link that isn't theirs.

export default async function up(pb) {
  const users = await pb.collection('users')

  if (!await pb.collection('bank_links')) {
    await pb.send('POST', '/api/collections', {
      name: 'bank_links',
      type: 'base',
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'provider', type: 'select', required: true, maxSelect: 1, values: ['simplefin'] },
        // AES-256 ($security.encrypt) of the access URL; hidden from every API answer.
        { name: 'access', type: 'text', required: true, hidden: true },
        // The institutions the link covers, as SimpleFIN names them.
        { name: 'institutions', type: 'json', maxSize: 5000 },
        // ok; error (the last sync failed, the next may not); reconnect (SimpleFIN refuses the access, link again).
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['ok', 'error', 'reconnect'] },
        { name: 'last_synced', type: 'date' },
        { name: 'last_attempt', type: 'date' },
        // What went wrong last, or what SimpleFIN said about an institution.
        { name: 'message', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_bank_links_owner ON bank_links (owner)'],
    })
  }

  const links = await pb.collection('bank_links')
  const accounts = await pb.collection('accounts')
  if (!accounts.fields.some(f => f.name === 'link')) {
    accounts.fields.push({ name: 'link', type: 'relation', collectionId: links.id, maxSelect: 1, cascadeDelete: false })
    await pb.send('PATCH', '/api/collections/accounts', { fields: accounts.fields })
  }
}
