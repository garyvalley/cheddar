// The confirmation and password-reset emails take the app's violet in place
// of the old orange (#9a5300) for their button, and its cool grey ground.
// 0001 wrote the templates; this swaps only the two colours, so any other
// edit to them stays, and a second run finds nothing to change.

const SWAPS = [['#9a5300', '#6b3fc4'], ['#f5f3ee', '#f6f5f9'], ['#1d1b16', '#1b1a20']]
const recolour = body => SWAPS.reduce((b, [from, to]) => b.replaceAll(from, to), body)

export default async function up(pb) {
  const users = await pb.collection('users')
  const change = {}
  for (const key of ['verificationTemplate', 'resetPasswordTemplate']) {
    const template = users[key]
    if (template?.body && recolour(template.body) !== template.body) change[key] = { ...template, body: recolour(template.body) }
  }
  if (Object.keys(change).length) await pb.send('PATCH', '/api/collections/users', change)
}
