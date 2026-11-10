// Three more colour themes to choose from in Settings (shared/theme.ts):
// blue, rose and mint, next to violet and cheddar. Only the theme field's
// list of values changes; everyone's choice stays as it was.

const THEMES = ['violet', 'cheddar', 'blue', 'rose', 'mint']

export default async function up(pb) {
  const users = await pb.collection('users')
  const theme = users.fields.find(f => f.name === 'theme')
  if (!theme || THEMES.every(v => theme.values.includes(v))) return
  theme.values = THEMES
  await pb.send('PATCH', '/api/collections/users', { fields: users.fields })
}
