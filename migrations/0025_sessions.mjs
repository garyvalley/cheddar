// `sessions`: one row per signed-in device (issue #41, pb_hooks/lib/sessions.js).
// A user's token is honoured only beside its row's id (X-Cheddar-Session,
// kept by Nuxt in an httpOnly cookie), so a sign-out ends the device for real,
// Settings lists devices and signs any one out, and a session needs a full
// sign-in again 30 days after the last one. Only the hooks read or write it
// (all rules null): the row holds a hash of the id, never the id.
//
// Times are milliseconds since 1970: signed_in (the password and code),
// verified (the last password typed, for linking or unlinking a bank),
// last_used.

export default async function up(pb) {
  if (await pb.collection('sessions')) return
  const users = await pb.collection('users')
  await pb.send('POST', '/api/collections', {
    name: 'sessions',
    type: 'base',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'sid_hash', type: 'text', required: true, max: 64, pattern: '^[0-9a-f]{64}$' },
      { name: 'device', type: 'text', max: 60 },
      { name: 'place', type: 'text', max: 2 },
      { name: 'signed_in', type: 'number', onlyInt: true, min: 0 },
      { name: 'verified', type: 'number', onlyInt: true, min: 0 },
      { name: 'last_used', type: 'number', onlyInt: true, min: 0 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_sessions_sid ON sessions (sid_hash)', 'CREATE INDEX idx_sessions_user ON sessions (user)'],
  })
}
