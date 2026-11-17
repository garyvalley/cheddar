// Passkeys (pb_hooks/passkeys.pb.js, lib/webauthn.js, issue #111): another
// way to sign in, which counts as both steps on its own.
//   - `passkeys`: each one's credential id, public key (JSON: { alg, x, y }
//     or { alg, n, e }), signature counter, the name the person gave it and
//     when it was last used. Only the hooks read or write it (all rules
//     null); Settings lists them through GET /api/passkeys.
//   - `passkey_challenges`: the one-time challenge each request is signed
//     over, for 5 minutes. Hooks only.
// Recent activity gains passkey_added and passkey_removed (shared/activity.ts).
const MORE_KINDS = ['passkey_added', 'passkey_removed']

export default async function up(pb) {
  const users = await pb.collection('users')
  if (!(await pb.collection('passkeys'))) {
    await pb.send('POST', '/api/collections', {
      name: 'passkeys',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'credential_id', type: 'text', required: true, max: 1400 },
        { name: 'public_key', type: 'text', required: true, max: 2000 },
        { name: 'sign_count', type: 'number', onlyInt: true, min: 0 },
        { name: 'name', type: 'text', max: 60 },
        { name: 'last_used', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_passkeys_credential ON passkeys (credential_id)',
        'CREATE INDEX idx_passkeys_owner ON passkeys (owner)',
      ],
    })
  }
  if (!(await pb.collection('passkey_challenges'))) {
    await pb.send('POST', '/api/collections', {
      name: 'passkey_challenges',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'challenge', type: 'text', required: true, max: 100 },
        { name: 'purpose', type: 'select', maxSelect: 1, required: true, values: ['register', 'sign_in'] },
        { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: 'expires', type: 'number', onlyInt: true, required: true },
      ],
      indexes: ['CREATE INDEX idx_passkey_challenges_expires ON passkey_challenges (expires)'],
    })
  }
  const events = await pb.collection('security_events')
  const fields = events.fields.map(f => (f.name === 'kind' ? { ...f, values: [...new Set([...f.values, ...MORE_KINDS])] } : f))
  await pb.send('PATCH', '/api/collections/security_events', { fields })
}
