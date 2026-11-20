// The bell in the top bar (shared/notices.ts): each person's record keeps
// which notices they had seen when they last opened it (`notices_seen`,
// { keys, at }), and the kinds they turned off (`notices_off`, a list of
// ids). Nothing else is stored: the notices themselves are worked out from
// the person's data each time. The users rules already let a person change
// only their own record, so nobody can read or clear another's.

export default async function up(pb) {
  const users = await pb.collection('users')
  const have = new Set(users.fields.map(f => f.name))
  const add = [
    { name: 'notices_seen', type: 'json', maxSize: 20000 },
    { name: 'notices_off', type: 'json', maxSize: 1000 },
  ].filter(f => !have.has(f.name))
  if (!add.length) return
  await pb.send('PATCH', '/api/collections/users', { fields: [...users.fields, ...add] })
}
