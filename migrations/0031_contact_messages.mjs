// Messages from the contact form (/contact, shared/contact.ts) to whoever
// runs Cheddar. Written only by pb_hooks/contact.pb.js and read only in the
// admin UI: every rule is null. `user` is set when the sender was signed in,
// and cleared if that account is deleted. Deleted after a year by the hook.

export default async function up(pb) {
  if (await pb.collection('contact_messages')) return
  const users = await pb.collection('users')
  await pb.send('POST', '/api/collections', {
    name: 'contact_messages',
    type: 'base',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'name', type: 'text', max: 100 },
      { name: 'email', type: 'text', required: true, max: 254 },
      { name: 'topic', type: 'select', required: true, maxSelect: 1, values: ['question', 'privacy', 'security', 'other'] },
      { name: 'message', type: 'text', required: true, max: 5000 },
      { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: ['CREATE INDEX idx_contact_messages_created ON contact_messages (created)'],
  })
}
