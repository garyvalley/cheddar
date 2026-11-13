<script setup lang="ts">
import { ACCOUNT_KINDS, formatCents, isLiability, kindLabel, type Account, type AccountKind } from '~~/shared/accounts'
import type { BankLinks } from '~~/shared/bank-links'
import { GROUPS, groupOf } from '~~/shared/overview'

// The one place accounts are set up: linked by signing in to the bank (Plaid), or added here
// and filled from statement files. Every other page only reads them.
const { data, refresh } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const { data: links } = await useFetch<BankLinks>('/api/bank-links', { key: 'bank-links', default: () => ({ enabled: false, links: [] }) })
const linked = computed(() => new Set(links.value.links.flatMap(l => l.accounts.map(a => a.id))))
// Closed accounts stay, for their history, out of the way until asked for.
const showClosed = ref(false)
const closedCount = computed(() => data.value.accounts.filter(a => a.closed_on).length)
watch(closedCount, (n) => { if (!n) showClosed.value = false })
// Accounts a current link keeps up to date are listed under that link; these are the rest,
// including the accounts of a link that was removed.
const accounts = computed(() => data.value.accounts.filter(a => !linked.value.has(a.id) && (showClosed.value || !a.closed_on)))

// Listed by kind, as Overview adds them up, each kind with its total.
const kinds = computed(() => GROUPS.map(g => {
  const list = accounts.value.filter(a => groupOf(a.kind) === g.id)
  const counted = list.filter(a => !a.excluded && !a.closed_on && a.balance_cents !== null)
  return { id: g.id, label: g.label, accounts: list, total_cents: counted.reduce((n, a) => n + a.balance_cents!, 0), any: counted.length > 0 }
}).filter(g => g.accounts.length))

// Name, kind, closed, counted: AccountEditor, in place of the row.
const changing = ref('')
async function changed(saved: boolean) {
  changing.value = ''
  if (saved) await refresh()
}

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

// The balance of an account no link keeps up to date is the person's to enter, for net worth.
const balance = useAction()
const editing = ref('')
const amount = ref('')
function startBalance(a: Account) {
  balance.error.value = ''
  editing.value = a.id
  amount.value = a.balance_cents === null ? '' : (Math.abs(a.balance_cents) / 100).toFixed(2)
}
async function saveBalance(a: Account) {
  if (!await balance.run(() => $fetch(`/api/accounts/${a.id}`, { method: 'PATCH', body: { balance: amount.value } }))) return
  editing.value = ''
  await refresh()
}
const closedDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const asOf = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const detail = (a: Account) => [kindLabel(a.kind), a.institution, a.last4 && `••${a.last4}`, a.closed_on && `Closed ${closedDay(a.closed_on)}`].filter(Boolean).join(' · ')
</script>

<template>
  <div>
    <AppHeader title="Accounts" sub="Every number in Cheddar comes from these accounts.">
      <NuxtLink v-if="data.accounts.length" to="/accounts/import" class="btn btn-tinted">Import</NuxtLink>
      <button v-if="!adding" class="btn btn-primary" @click="adding = true">Add an account…</button>
    </AppHeader>

    <BankLinks :show-closed="showClosed" @changed="refresh()" />

    <section v-if="accounts.length" class="group" aria-labelledby="list-title">
      <h2 id="list-title" class="group-title">{{ links.links.length ? 'Other accounts' : 'Your accounts' }}</h2>
      <div class="kinds">
        <div v-for="g in kinds" :key="g.id" class="card">
          <div class="panel-head">
            <h3 class="panel-title">{{ g.label }}</h3>
            <span v-if="g.any" class="num kind-total" :class="moneyTone(g.total_cents)">{{ formatCents(g.total_cents) }}</span>
          </div>
          <ul class="list">
            <li v-for="a in g.accounts" :key="a.id" :class="changing === a.id ? 'editing' : 'row acct'">
              <AccountEditor v-if="changing === a.id" :account="a" @done="changed" />
              <template v-else-if="deleting === a.id">
                <span class="row-label footnote">Delete {{ a.name }} and every transaction in it?</span>
                <button class="btn btn-plain" @click="deleting = ''">Cancel</button>
                <button class="btn btn-danger" :disabled="remove.busy.value" @click="confirmDelete(a.id)">
                  <span v-if="remove.busy.value" class="spinner" aria-hidden="true" /> Delete
                </button>
              </template>
              <form v-else-if="editing === a.id" class="balance-form" @submit.prevent="saveBalance(a)">
                <label class="row-label">
                  <span class="block">{{ isLiability(a.kind) ? `What ${a.name} owes today` : `What ${a.name} holds today` }}</span>
                  <input v-model="amount" class="input num" inputmode="decimal" placeholder="0.00" required autofocus :aria-label="`Balance of ${a.name}`">
                </label>
                <button type="button" class="btn btn-plain" @click="editing = ''">Cancel</button>
                <button class="btn btn-primary" :disabled="balance.busy.value">
                  <span v-if="balance.busy.value" class="spinner" aria-hidden="true" /> Save
                </button>
              </form>
              <template v-else>
                <span class="row-label">
                  <span class="block">{{ a.name }} <span v-if="a.excluded" class="badge badge-off">Not counted</span></span>
                  <span class="caption">{{ detail(a) }}</span>
                </span>
                <span class="actions">
                  <button class="act" :aria-label="`Edit ${a.name}`" @click="changing = a.id">Edit</button>
                  <NuxtLink :to="{ path: '/accounts/import', query: { account: a.id } }" class="act" :aria-label="`Import a statement into ${a.name}`">Import</NuxtLink>
                  <button class="act danger" :aria-label="`Delete ${a.name}`" @click="deleting = a.id">Delete</button>
                </span>
                <button class="balance" :aria-label="`Set the balance of ${a.name}`" :title="`Set the balance of ${a.name}`" @click="startBalance(a)">
                  <template v-if="a.balance_cents !== null">
                    <span class="num block" :class="moneyTone(a.balance_cents)">{{ formatCents(a.balance_cents) }}</span>
                    <span class="caption">as of {{ asOf(a.balance_date) }}</span>
                  </template>
                  <template v-else>Set balance</template>
                </button>
              </template>
            </li>
          </ul>
        </div>
      </div>
      <p v-if="remove.error.value" class="notice notice-error" role="alert">{{ remove.error.value }}</p>
      <p v-if="balance.error.value" class="notice notice-error" role="alert">{{ balance.error.value }}</p>
      <p class="group-footer">Click a balance to bring it up to date. Edit renames an account, closes it, or leaves it out of your numbers.</p>
    </section>

    <div v-if="closedCount" class="closed-toggle">
      <button class="btn btn-plain" :aria-pressed="showClosed" @click="showClosed = !showClosed">
        {{ showClosed ? 'Hide closed accounts' : `Show closed accounts (${closedCount})` }}
      </button>
    </div>

    <section v-if="adding" class="group" aria-labelledby="add-title">
      <h2 id="add-title" class="group-title">Add an account yourself</h2>
      <form class="card" @submit.prevent="save">
        <p v-if="!accounts.length" class="field footnote">
          For an account you'd rather not link, or a bank that can't be linked: add it here, then import the CSV, OFX or QFX file your bank's website lets you download.
        </p>
        <label class="field">
          <span class="field-label">Name</span>
          <input v-model="form.name" v-focus class="input" maxlength="100" placeholder="Everyday checking" required>
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
      <p v-if="add.error.value" class="notice notice-error" role="alert">{{ add.error.value }}</p>
    </section>
  </div>
</template>

<style scoped>
.kinds { display: grid; gap: 1.25rem; }
.kind-total { font-weight: 600; }
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.acct { gap: 1rem; }
.balance {
  display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; min-width: 8.5rem; min-height: 2.75rem; justify-content: center;
  padding: 0.25rem 0.5rem; margin-right: -0.5rem; border: 0; border-radius: var(--radius-sm); background: none;
  font: inherit; color: var(--accent); text-align: right; line-height: 1.2; cursor: pointer;
}
.balance:hover { background: var(--surface-2); }
.balance-form { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
.balance-form .input { margin-top: 0.25rem; max-width: 12rem; }
.actions { display: flex; gap: 0.125rem; }
.act {
  display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 0.5rem; border: 0; background: none;
  font: inherit; font-size: 0.875rem; color: var(--accent); cursor: pointer; border-radius: var(--radius-sm);
}
.act:hover { background: var(--surface-2); text-decoration: none; }
.act.danger { color: var(--text-2); }
.act.danger:hover { color: var(--critical); }
/* On a phone the actions take a line of their own, under the name, so the name and balance keep theirs. */
@media (max-width: 560px) {
  .acct { flex-wrap: wrap; row-gap: 0; }
  .acct .row-label { flex: 1 1 calc(100% - 9.5rem); }
  .acct .actions { order: 3; width: 100%; margin-left: -0.5rem; }
}
.editing { list-style: none; }
.closed-toggle { margin: -1rem 0 1.5rem; }
</style>
