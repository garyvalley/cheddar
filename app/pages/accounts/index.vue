<script setup lang="ts">
import { ACCOUNT_KINDS, kindLabel, type Account, type AccountKind } from '~~/shared/accounts'
import type { BankLinks } from '~~/shared/bank-links'

// The one place accounts are set up: linked through SimpleFIN, or added here
// and filled from statement files. Every other page only reads them.
const { data, refresh } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const { data: links } = await useFetch<BankLinks>('/api/bank-links', { key: 'bank-links', default: () => ({ enabled: false, links: [] }) })
const linked = computed(() => new Set(links.value.links.flatMap(l => l.accounts.map(a => a.id))))
// Accounts a current link keeps up to date are listed under that link; these are the rest,
// including the accounts of a link that was removed.
const accounts = computed(() => data.value.accounts.filter(a => !linked.value.has(a.id)))

const add = useAction()
const remove = useAction()
const adding = ref(false)
const form = reactive({ name: '', kind: 'checking' as AccountKind, institution: '', last4: '' })
const deleting = ref('')

// With nothing set up and no linking to offer, adding by hand is the only way in, so its form starts open.
const handOnly = computed(() => !data.value.accounts.length && !links.value.enabled)
watch(handOnly, (only) => { if (only) adding.value = true }, { immediate: true })

async function save() {
  const r = await add.run(() => $fetch('/api/accounts', { method: 'POST', body: { ...form } }))
  if (!r) return
  Object.assign(form, { name: '', kind: 'checking', institution: '', last4: '' })
  adding.value = false
  await refresh()
}

async function confirmDelete(id: string) {
  if (!await remove.succeed(() => $fetch(`/api/accounts/${id}`, { method: 'DELETE' }))) return
  deleting.value = ''
  await refresh()
}

const detail = (a: Account) => [kindLabel(a.kind), a.institution, a.last4 && `••${a.last4}`].filter(Boolean).join(' · ')
</script>

<template>
  <div>
    <AppHeader title="Accounts">
      <NuxtLink v-if="data.accounts.length" to="/accounts/import" class="btn btn-tinted">Import</NuxtLink>
    </AppHeader>

    <p class="subhead intro">
      Connect every account here. Overview, Spending, Projections and Taxes are all worked out from what these accounts hold.
    </p>

    <BankLinks @changed="refresh()" />

    <section v-if="accounts.length" class="group" aria-labelledby="list-title">
      <h2 id="list-title" class="group-title">{{ links.links.length ? 'Other accounts' : 'Your accounts' }}</h2>
      <ul class="card list">
        <li v-for="a in accounts" :key="a.id" class="row">
          <template v-if="deleting === a.id">
            <span class="row-label footnote">Delete {{ a.name }} and every transaction in it?</span>
            <button class="btn btn-plain" @click="deleting = ''">Cancel</button>
            <button class="btn btn-danger" :disabled="remove.busy.value" @click="confirmDelete(a.id)">
              <span v-if="remove.busy.value" class="spinner" aria-hidden="true" /> Delete
            </button>
          </template>
          <template v-else>
            <span class="row-label">
              <span class="block">{{ a.name }}</span>
              <span class="footnote">{{ detail(a) }}</span>
            </span>
            <NuxtLink :to="{ path: '/accounts/import', query: { account: a.id } }" class="btn btn-plain" :aria-label="`Import a statement into ${a.name}`">Import</NuxtLink>
            <button class="btn btn-plain danger" :aria-label="`Delete ${a.name}`" @click="deleting = a.id">Delete</button>
          </template>
        </li>
      </ul>
      <p v-if="remove.error.value" class="notice notice-error" role="alert">{{ remove.error.value }}</p>
    </section>

    <section class="group" aria-labelledby="add-title">
      <h2 id="add-title" class="group-title">Add an account yourself</h2>
      <form v-if="adding" class="card" @submit.prevent="save">
        <p v-if="!accounts.length" class="field footnote">
          For an account you'd rather not link, or a bank SimpleFIN doesn't reach: add it here, then import the CSV, OFX or QFX file your bank's website lets you download.
        </p>
        <label class="field">
          <span class="field-label">Name</span>
          <input v-model="form.name" class="input" maxlength="100" placeholder="Everyday checking" required>
        </label>
        <label class="field">
          <span class="field-label">Kind</span>
          <select v-model="form.kind" class="select">
            <option v-for="k in ACCOUNT_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Bank or card issuer (optional)</span>
          <input v-model="form.institution" class="input" maxlength="100">
        </label>
        <label class="field">
          <span class="field-label">Last four digits (optional)</span>
          <input v-model="form.last4" class="input num" inputmode="numeric" maxlength="4" pattern="\d{4}">
        </label>
        <div class="field btn-row">
          <button class="btn btn-primary" :disabled="add.busy.value">
            <span v-if="add.busy.value" class="spinner" aria-hidden="true" /> Add account
          </button>
          <button v-if="!handOnly" type="button" class="btn btn-plain" @click="adding = false">Cancel</button>
        </div>
      </form>
      <div v-else class="card">
        <button class="row add-row" @click="adding = true">Add an account…</button>
      </div>
      <p v-if="add.error.value" class="notice notice-error" role="alert">{{ add.error.value }}</p>
    </section>
  </div>
</template>

<style scoped>
.intro { margin: -0.75rem 0 1.5rem; }
.list { list-style: none; margin: 0; padding: 0; }
.danger { color: var(--critical); }
.add-row { width: 100%; border: 0; background: none; font: inherit; color: var(--accent); text-align: left; cursor: pointer; }
</style>
