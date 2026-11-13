<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { CASHFLOW_CADENCES, type CashflowEvent, type CashflowItem } from '~~/shared/cashflow'
import { cadenceOf, type Recurring } from '~~/shared/recurring'

interface CashflowData {
  from: string
  to: string
  days: number
  accounts: { id: string, name: string, balance_cents: number | null, balance_date: string, projected_cents: number | null }[]
  items: CashflowItem[]
  events: CashflowEvent[]
  detected: Recurring[]
}

const today = useToday()
const days = ref(30)
const { data, error, refresh } = await useFetch<CashflowData>('/api/cashflow', {
  query: { days },
  default: () => ({ from: today, to: today, days: 30, accounts: [], items: [], events: [], detected: [] }),
})
const creating = useAction()
const saving = useAction()
const removing = useAction()
const editing = ref('')
const deleting = ref('')
const form = reactive({ name: '', account: '', direction: 'expense', amount: '', cadence: 'once', next_date: today, source_key: '' })
const busy = computed(() => creating.busy.value || saving.busy.value)

function reset() {
  editing.value = ''
  Object.assign(form, { name: '', account: data.value.accounts[0]?.id ?? '', direction: 'expense', amount: '', cadence: 'once', next_date: today, source_key: '' })
}

function edit(item: CashflowItem) {
  editing.value = item.id
  deleting.value = ''
  Object.assign(form, {
    name: item.name,
    account: item.account,
    direction: item.direction,
    amount: (item.amount_cents / 100).toFixed(2),
    cadence: item.cadence,
    next_date: item.next_date,
    source_key: item.source_key,
  })
  saving.error.value = ''
}

function plan(charge: Recurring) {
  editing.value = ''
  Object.assign(form, {
    name: charge.name,
    account: charge.account,
    direction: 'expense',
    amount: (charge.amount_cents / 100).toFixed(2),
    cadence: charge.cadence,
    next_date: charge.next,
    source_key: charge.key,
  })
  creating.error.value = ''
}

async function submit() {
  const action = editing.value ? saving : creating
  const result = await action.run(() => $fetch(editing.value ? `/api/cashflow/${editing.value}` : '/api/cashflow', {
    method: editing.value ? 'PATCH' : 'POST',
    body: form,
  }))
  if (!result) return
  reset()
  await refresh()
}

async function remove(item: CashflowItem) {
  if (!await removing.succeed(() => $fetch(`/api/cashflow/${item.id}`, { method: 'DELETE' }))) return
  deleting.value = ''
  if (editing.value === item.id) reset()
  await refresh()
}

const date = (value: string, year = false) => new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
const amountTone = (amount: number) => amount < 0 ? 'loss' : 'gain'
const savedFor = (key: string) => data.value.items.find(item => item.source_key === key)
const eventsByDate = computed(() => Array.from(data.value.events.reduce((groups, event) => {
  const list = groups.get(event.date) ?? []
  list.push(event)
  groups.set(event.date, list)
  return groups
}, new Map<string, CashflowEvent[]>()).entries(), ([date, events]) => ({ date, events })))
</script>

<template>
  <div>
    <AppHeader title="Cash flow" sub="See expected money in and out before it happens." />
    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <section v-if="!data.accounts.length" class="group">
      <div class="card card-pad stack">
        <p class="headline">No counted accounts yet</p>
        <p class="muted">Add an account with a current balance before planning its future cash flow.</p>
        <NuxtLink to="/accounts" class="btn btn-primary">Go to Accounts</NuxtLink>
      </div>
    </section>

    <template v-else>
      <section class="group" aria-label="Forecast period">
        <div class="toolbar">
          <div class="segmented" role="group" aria-label="Forecast length">
            <button v-for="span in [30, 60, 90]" :key="span" class="seg" :aria-pressed="days === span" @click="days = span">{{ span }} days</button>
          </div>
          <span class="footnote">{{ date(data.from, true) }} to {{ date(data.to, true) }}</span>
        </div>
      </section>

      <section class="group" aria-labelledby="balances-title">
        <h2 id="balances-title" class="group-title">Projected balances</h2>
        <div class="card">
          <div v-for="account in data.accounts" :key="account.id" class="row">
            <span class="row-label">
              <span class="block">{{ account.name }}</span>
              <span class="footnote">Starting {{ account.balance_cents === null ? 'balance not set' : `${formatCents(account.balance_cents)}${account.balance_date ? ` as of ${date(account.balance_date, true)}` : ''}` }}</span>
            </span>
            <span class="num" :class="account.projected_cents === null ? 'muted' : amountTone(account.projected_cents)">{{ account.projected_cents === null ? 'Unknown' : formatCents(account.projected_cents) }}</span>
          </div>
          <p class="card-pad footnote">Estimates use current account balances, planned items, and detected recurring charges. They do not schedule or make payments.</p>
        </div>
      </section>

      <div class="cols">
        <section class="group" aria-labelledby="events-title">
          <h2 id="events-title" class="group-title">Expected activity</h2>
          <div v-if="!data.events.length" class="card card-pad"><p class="muted">Nothing expected in this period yet.</p></div>
          <div v-else class="card">
            <template v-for="group in eventsByDate" :key="group.date">
              <h3 class="day-head">{{ date(group.date, true) }}</h3>
              <div v-for="event in group.events" :key="event.id" class="row event">
                <span class="row-label">
                  <span class="block">{{ event.name }}</span>
                  <span class="footnote">{{ data.accounts.find(a => a.id === event.account)?.name }} · {{ event.source === 'recurring' ? 'Estimated from past charges' : 'Planned' }}</span>
                </span>
                <span class="event-side">
                  <span class="num" :class="amountTone(event.amount_cents)">{{ formatCents(event.amount_cents) }}</span>
                  <span class="footnote">{{ event.running_cents === null ? 'Balance unknown' : `After: ${formatCents(event.running_cents)}` }}</span>
                </span>
              </div>
            </template>
          </div>
        </section>

        <div>
          <section class="group" aria-labelledby="plan-title">
            <h2 id="plan-title" class="group-title">{{ editing ? 'Edit planned item' : 'Add planned item' }}</h2>
            <form class="card form" @submit.prevent="submit">
              <label class="field"><span class="field-label">Name</span><input v-model="form.name" class="input" maxlength="100" placeholder="Payday or rent" required></label>
              <label class="field"><span class="field-label">Account</span><select v-model="form.account" class="select" required><option v-for="account in data.accounts" :key="account.id" :value="account.id">{{ account.name }}</option></select></label>
              <div class="segmented field" role="group" aria-label="Money in or out">
                <button type="button" class="seg" :aria-pressed="form.direction === 'income'" @click="form.direction = 'income'">Money in</button>
                <button type="button" class="seg" :aria-pressed="form.direction === 'expense'" @click="form.direction = 'expense'">Money out</button>
              </div>
              <div class="pair">
                <label class="field"><span class="field-label">Amount</span><input v-model="form.amount" class="input num" inputmode="decimal" placeholder="$0.00" required></label>
                <label class="field"><span class="field-label">Frequency</span><select v-model="form.cadence" class="select"><option v-for="cadence in CASHFLOW_CADENCES" :key="cadence.id" :value="cadence.id">{{ cadence.label }}</option></select></label>
              </div>
              <label class="field"><span class="field-label">Next date</span><input v-model="form.next_date" class="input" type="date" required></label>
              <p v-if="form.source_key" class="footnote">This replaces the automatic estimate for that recurring charge.</p>
              <p v-if="creating.error.value || saving.error.value" class="notice notice-error" role="alert">{{ creating.error.value || saving.error.value }}</p>
              <div class="field btn-row">
                <button class="btn btn-primary" :disabled="busy"><span v-if="busy" class="spinner" aria-hidden="true" />{{ editing ? 'Save changes' : 'Add to forecast' }}</button>
                <button v-if="editing || form.source_key" type="button" class="btn btn-plain" @click="reset">Cancel</button>
              </div>
            </form>
          </section>

          <section v-if="data.items.length" class="group" aria-labelledby="planned-title">
            <h2 id="planned-title" class="group-title">Your planned items</h2>
            <ul class="card list">
              <li v-for="item in data.items" :key="item.id" class="row">
                <template v-if="deleting === item.id">
                  <span class="row-label footnote">Delete {{ item.name }}?</span>
                  <button class="btn btn-plain" @click="deleting = ''">Cancel</button>
                  <button class="btn btn-danger" @click="remove(item)">Delete</button>
                </template>
                <template v-else>
                  <span class="row-label"><span class="block">{{ item.name }}</span><span class="footnote">{{ date(item.next_date, true) }} · {{ CASHFLOW_CADENCES.find(c => c.id === item.cadence)?.label }} · {{ formatCents(item.amount_cents) }}</span></span>
                  <span class="actions"><button class="btn btn-plain" @click="edit(item)">Edit</button><button class="btn btn-plain danger" @click="deleting = item.id">Delete</button></span>
                </template>
              </li>
            </ul>
            <p v-if="removing.error.value" class="notice notice-error" role="alert">{{ removing.error.value }}</p>
          </section>

          <section v-if="data.detected.length" class="group" aria-labelledby="detected-title">
            <h2 id="detected-title" class="group-title">Detected regular charges</h2>
            <ul class="card list">
              <li v-for="charge in data.detected" :key="charge.key" class="row">
                <span class="row-label"><span class="block">{{ charge.name }}</span><span class="footnote">{{ cadenceOf(charge.cadence).label }} · Next {{ date(charge.next, true) }} · {{ formatCents(charge.amount_cents) }}</span></span>
                <button v-if="!savedFor(charge.key)" class="btn btn-tinted" @click="plan(charge)">Plan</button>
                <span v-else class="footnote">Planned</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.form { padding: 0 1.25rem; }
.pair { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.pair .field { flex: 1 1 8rem; }
.day-head { margin: 0; padding: 0.75rem 1.25rem; border-bottom: var(--border); font-size: 0.875rem; font-weight: 600; }
.day-head:not(:first-child) { border-top: var(--border); }
.event-side { display: flex; flex-direction: column; align-items: flex-end; text-align: right; gap: 0.125rem; }
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.actions { display: flex; gap: 0.125rem; }
.danger { color: var(--critical); }
@media (min-width: 900px) { .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; align-items: start; } }
</style>