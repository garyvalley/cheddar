// Two-step sign-in is required. A session from an account without it (a new
// account before its setup) may still read its own record, set up an
// authenticator app, sign out and delete the account -- but not change its
// profile, and no collection that holds financial data will let it in: each
// one's rules include `@request.auth.mfa_enabled = true` (migrations/README.md).
export default async function up(pb) {
  await pb.send('PATCH', '/api/collections/users', {
    updateRule: 'id = @request.auth.id && mfa_enabled = true',
  })
}
