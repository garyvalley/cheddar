// `security_events`: what happened on each account (issue #43), for
// Settings → Recent activity (shared/activity.ts). Only the hooks write it
// (pb_hooks/glue/events.js): create, update and delete rules are null. Each
// person reads their own, with two-step sign-in on. Rows older than 90 days
// go every night (pb_hooks/security_events.pb.js).

const MINE = 'user = @request.auth.id && @request.auth.mfa_enabled = true'
const KINDS = [
  'sign_in', 'code_wrong', 'codes_locked', 'two_step_changed', 'recovery_codes_new',
  'password_changed', 'email_changed', 'signed_out_everywhere', 'bank_linked', 'bank_unlinked', 'export',
]

export default async function up(pb) {
  if (await pb.collection('security_events')) return
  const users = await pb.collection('users')
  await pb.send('POST', '/api/collections', {
    name: 'security_events',
    type: 'base',
    listRule: MINE,
    viewRule: MINE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'kind', type: 'select', maxSelect: 1, required: true, values: KINDS },
      { name: 'device', type: 'text', max: 60 },
      { name: 'place', type: 'text', max: 2 },
      { name: 'detail', type: 'text', max: 120 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: ['CREATE INDEX idx_security_events_user ON security_events (user, created)'],
  })
}
