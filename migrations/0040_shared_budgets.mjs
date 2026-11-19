// Shared household budgets (issue #113). A budget's owner can share it with
// their household (`household`); every member then sees it, and may change
// its amount, but not its category, rollover, sharing or owner (G's
// choice), and only its owner removes it. A member's own budget for the
// same category stays theirs (server/data/budgets.ts shows theirs first).
// pb_hooks/households.pb.js stops the sharing when its owner leaves or is
// removed, or the household closes.
const MFA = '@request.auth.mfa_enabled = true'
const MEMBER = '(household != \'\' && household.members.id ?= @request.auth.id)'
const OWN_HOUSEHOLD
  = '(@request.body.household:isset = false || @request.body.household = \'\' || @request.body.household.members.id ?= @request.auth.id)'
const KEEPS_OWNER
  = '(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)'
const AMOUNT_ONLY = [
  'owner',
  'category',
  'household',
  'rollover',
  'rollover_from',
]
  .map(f => `@request.body.${f}:isset = false`)
  .join(' && ')

export default async function up(pb) {
  const budgets = await pb.collection('budgets')
  const households = await pb.collection('households')
  if (!budgets.fields.some(f => f.name === 'household')) {
    budgets.fields.push({
      name: 'household',
      type: 'relation',
      collectionId: households.id,
      maxSelect: 1,
      required: false,
      cascadeDelete: false,
    })
  }
  await pb.send('PATCH', '/api/collections/budgets', {
    fields: budgets.fields,
    listRule: `(owner = @request.auth.id || ${MEMBER}) && ${MFA}`,
    viewRule: `(owner = @request.auth.id || ${MEMBER}) && ${MFA}`,
    createRule: `@request.body.owner = @request.auth.id && ${OWN_HOUSEHOLD} && ${MFA}`,
    updateRule: `((owner = @request.auth.id && ${KEEPS_OWNER} && ${OWN_HOUSEHOLD}) || (owner != @request.auth.id && ${MEMBER} && ${AMOUNT_ONLY})) && ${MFA}`,
    deleteRule: `owner = @request.auth.id && ${MFA}`,
  })
}
