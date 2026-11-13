<script setup lang="ts">
interface HouseholdMember { id: string, name: string, email: string, owner: boolean }
interface HouseholdData {
  household: { id: string, name: string, owner: string, members: HouseholdMember[] } | null
  accounts: { id: string, name: string, shared: boolean }[]
  invitations: { id: string, name: string, invited_by: string }[]
}

const { data, refresh, error: loadError } = await useFetch<HouseholdData>('/api/household', {
  default: () => ({ household: null, accounts: [], invitations: [] }),
})
const action = useAction()
const form = reactive({ name: '', email: '' })
const removing = ref('')
const isOwner = computed(() => data.value.household?.owner === useAuth().me.value?.id)
const members = computed(() => data.value.household?.members ?? [])

async function submit(path: string, method: 'POST' | 'DELETE', body?: Record<string, unknown>) {
  const result = await action.run(() => $fetch(path, { method, ...(body ? { body } : {}) }))
  if (!result) return false
  removing.value = ''
  await refresh()
  return true
}

async function createHousehold() {
  if (await submit('/api/household', 'POST', { name: form.name })) form.name = ''
}

async function sendInvite() {
  if (await submit('/api/household/invite', 'POST', { email: form.email })) form.email = ''
}

async function share(account: HouseholdData['accounts'][number], event: Event) {
  const shared = (event.target as HTMLInputElement).checked
  await submit(`/api/household/accounts/${account.id}/share`, 'POST', { shared })
}

function memberAction(member: HouseholdMember) {
  removing.value = member.id
}
</script>

<template>
  <section id="household" class="group" aria-labelledby="household-title">
    <h2 id="household-title" class="group-title">Household</h2>
    <p v-if="loadError" class="notice notice-error" role="alert">{{ errorMessage(loadError) }}</p>

    <div v-if="!data.household" class="card">
      <form class="field stack" @submit.prevent="createHousehold">
        <p class="footnote">Share selected accounts and transactions with other verified Cheddar users. Personal accounts and tax settings stay private.</p>
        <label>
          <span class="field-label">Household name</span>
          <input v-model="form.name" class="input" maxlength="60" placeholder="Valley household" required>
        </label>
        <div class="btn-row"><button class="btn btn-primary" :disabled="action.busy.value"><span v-if="action.busy.value" class="spinner" aria-hidden="true" />Create household</button></div>
      </form>
      <ul v-if="data.invitations.length" class="list">
        <li v-for="invite in data.invitations" :key="invite.id" class="row">
          <span class="row-label">{{ invite.name }}<span class="footnote block">Invited by {{ invite.invited_by }}</span></span>
          <button class="btn btn-primary" :disabled="action.busy.value" @click="submit(`/api/household/invites/${invite.id}/accept`, 'POST')">Accept</button>
        </li>
      </ul>
    </div>

    <div v-else class="card">
      <div class="row">
        <span class="row-label"><span class="block">{{ data.household.name }}</span><span class="footnote">{{ isOwner ? 'Owner' : 'Member' }} · {{ members.length }} {{ members.length === 1 ? 'person' : 'people' }}</span></span>
        <button class="btn btn-plain danger" :disabled="action.busy.value" @click="submit('/api/household/leave', 'POST')">{{ isOwner ? 'Close household' : 'Leave' }}</button>
      </div>

      <ul class="list">
        <li v-for="member in members" :key="member.id" class="row">
          <span class="row-label"><span class="block">{{ member.name }}<span v-if="member.owner" class="badge">Owner</span></span><span class="footnote">{{ member.email }}</span></span>
          <template v-if="removing === member.id">
            <button class="btn btn-plain" @click="removing = ''">Cancel</button>
            <button class="btn btn-danger" :disabled="action.busy.value" @click="submit(`/api/household/members/${member.id}`, 'DELETE')">Remove</button>
          </template>
          <button v-else-if="isOwner && !member.owner" class="btn btn-plain" :disabled="action.busy.value" @click="memberAction(member)">Remove…</button>
        </li>
      </ul>

      <form v-if="isOwner" class="field stack" @submit.prevent="sendInvite">
        <label><span class="field-label">Invite an existing verified user</span><input v-model="form.email" class="input" type="email" autocomplete="email" required></label>
        <div class="btn-row"><button class="btn btn-tinted" :disabled="action.busy.value"><span v-if="action.busy.value" class="spinner" aria-hidden="true" />Invite</button></div>
      </form>

      <section v-if="isOwner" class="share-list" aria-labelledby="share-title">
        <h3 id="share-title" class="share-title">Your accounts</h3>
        <p class="footnote">Members can edit shared transaction details. Only you can manage accounts, balances, categories, and bank links.</p>
        <label v-for="account in data.accounts" :key="account.id" class="row share-row">
          <span class="row-label">{{ account.name }}</span>
          <input type="checkbox" :checked="account.shared" :disabled="action.busy.value || (!account.shared && members.length < 2)" @change="share(account, $event)">
        </label>
        <p v-if="members.length < 2" class="footnote">Invite someone before sharing an account.</p>
      </section>
    </div>

    <p v-if="action.error.value" class="notice notice-error" role="alert">{{ action.error.value }}</p>
    <p class="group-footer">Household members can see only accounts you choose. Removing a member or unsharing an account immediately revokes access.</p>
  </section>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.share-list { padding: 1rem 1.25rem; border-top: var(--border); }
.share-title { margin: 0 0 0.25rem; font-size: 0.9375rem; }
.share-list > p { margin: 0.25rem 0 0.5rem; }
.share-row { padding: 0.125rem 0; }
.share-row input { width: 1.25rem; height: 1.25rem; accent-color: var(--accent); }
.danger { color: var(--critical); }
</style>