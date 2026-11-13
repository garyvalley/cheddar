// `user_totp.lockouts`: how many times wrong codes have locked two-step
// sign-in since the last right code. Each lockout lasts twice the one before
// (15 minutes, 30, an hour, ... at most a day), so someone holding the
// password can't keep guessing at five codes every 15 minutes (issue #38).
// pb_hooks/lib/lockout.js reads it; a right code sets it back to 0.

export default async function up(pb) {
  const totp = await pb.collection('user_totp')
  if (totp.fields.some(f => f.name === 'lockouts')) return
  await pb.send('PATCH', '/api/collections/user_totp', {
    fields: [...totp.fields, { name: 'lockouts', type: 'number', min: 0 }],
  })
}
