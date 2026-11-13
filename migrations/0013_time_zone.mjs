// Each person's time zone (an IANA name such as "America/Los_Angeles"), so
// "today" is their day and not the server's UTC one: a balance entered on a
// US evening was dated tomorrow, and a month-end evening counted as next
// month. Saved on their own user record like `state`; the users rules already
// let a person change only their own. Empty means not known yet.

export default async function up(pb) {
  const users = await pb.collection('users')
  if (users.fields.some(f => f.name === 'time_zone')) return
  await pb.send('PATCH', '/api/collections/users', { fields: [...users.fields, { name: 'time_zone', type: 'text', max: 64 }] })
}
