// Each person's look: a colour theme and light, dark or automatic
// (shared/theme.ts), set in Settings and saved on their own user record, so
// every device they sign in on matches. Empty means the default (violet,
// automatic). The users rules already let a person change only their own.

export default async function up(pb) {
  const users = await pb.collection('users')
  const have = new Set(users.fields.map(f => f.name))
  const add = [
    { name: 'theme', type: 'select', maxSelect: 1, values: ['violet', 'cheddar'] },
    { name: 'appearance', type: 'select', maxSelect: 1, values: ['system', 'light', 'dark'] },
  ].filter(f => !have.has(f.name))
  if (!add.length) return
  await pb.send('PATCH', '/api/collections/users', { fields: [...users.fields, ...add] })
}
