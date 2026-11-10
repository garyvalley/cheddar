// Accounts: the users collection's own fields and auth settings, and the
// user_totp store behind two-step sign-in (pb_hooks/two_step.pb.js).
//
// Every user sees and changes only their own record. Sign-up is open (the
// app will take other people later). Deleting is closed to the record API:
// pb_hooks/accounts.pb.js deletes, after checking the password.

const shell = (heading, body) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
  + `<body style="margin:0;padding:0;background:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">`
  + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f9;padding:40px 20px"><tr><td align="center">`
  + `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px"><tr><td style="padding:40px 32px">`
  + `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1b1a20">${heading}</h1>${body}`
  + `</td></tr></table></td></tr></table></body></html>`

const button = (href, label) => `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:12px 28px;`
  + `background:#6b3fc4;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px">${label}</a></p>`

const p = text => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3d3a33">${text}</p>`

export default async function up(pb) {
  const users = await pb.collection('users')
  const have = new Set(users.fields.map(f => f.name))
  const add = [
    // A US state or DC as its two-letter code; the app checks it against
    // shared/states.ts. Empty until the person chooses.
    { name: 'state', type: 'text', max: 2, pattern: '^[A-Z]{2}$' },
    { name: 'filing_status', type: 'select', maxSelect: 1,
      values: ['single', 'married_joint', 'married_separate', 'head_of_household', 'qualifying_surviving_spouse'] },
    // Only pb_hooks/two_step.pb.js sets it; the record API can't.
    { name: 'mfa_enabled', type: 'bool' },
  ].filter(f => !have.has(f.name))

  await pb.send('PATCH', '/api/collections/users', {
    fields: [...users.fields, ...add],
    listRule: 'id = @request.auth.id',
    viewRule: 'id = @request.auth.id',
    createRule: '',
    updateRule: 'id = @request.auth.id',
    deleteRule: null,
    passwordAuth: { enabled: true, identityFields: ['email'] },
    // Three days, renewed on every page load (server/api/auth/me.get.ts):
    // an unused session ends soon, an active one doesn't.
    authToken: { duration: 259200 },
    mfa: { enabled: true, duration: 600, rule: 'mfa_enabled = true' },
    // PocketBase allows MFA only with a second built-in auth method on. OTP
    // is that method in name only: pb_hooks/two_step.pb.js refuses every
    // request for or with one, and the second step is the authenticator app.
    otp: { enabled: true, duration: 300, length: 6 },
    authAlert: { enabled: true },
    verificationTemplate: {
      subject: 'Confirm your {APP_NAME} email',
      body: shell('Confirm your email', p('Tap the button to confirm this address for your Cheddar account.')
        + button('{APP_URL}/verify-email?token={TOKEN}', 'Confirm email')
        + p('If you didn\'t sign up for Cheddar, you can ignore this email.')),
    },
    resetPasswordTemplate: {
      subject: 'Reset your {APP_NAME} password',
      body: shell('Reset your password', p('Tap the button to choose a new password. The link works for 30 minutes.')
        + button('{APP_URL}/reset-password?token={TOKEN}', 'Choose a new password')
        + p('If you didn\'t ask for this, you can ignore this email: your password stays as it is.')),
    },
  })

  if (await pb.collection('user_totp')) return
  await pb.send('POST', '/api/collections', {
    name: 'user_totp',
    type: 'base',
    // Null rules: only the hooks (and a superuser) read or write it.
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'secret', type: 'text' },
      { name: 'pending_secret', type: 'text' },
      { name: 'last_step', type: 'number', min: 0 },
      // Hashes only: the codes themselves are shown once.
      { name: 'recovery_codes', type: 'json', maxSize: 2000 },
      { name: 'attempts', type: 'number', min: 0 },
      { name: 'locked_until', type: 'date' },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_user_totp_user ON user_totp (user)'],
  })
}
