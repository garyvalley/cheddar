<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { cadenceOf, type Recurring, type RecurringSummary } from '~~/shared/recurring'

// Spending's Recurring section: the subscriptions and bills Cheddar found in
// the accounts' spending (shared/recurring.ts), what each costs a year, a
// price that changed, and the ones that stopped.

const props = defineProps<{ account: string, names: Map<string, string> }>()

const { data, error } = await useFetch<RecurringSummary>('/api/recurring', {
  query: { account: computed(() => props.account || undefined) },
  default: () => ({ items: [], stopped: [], yearly_cents: 0, monthly_cents: 0 }),
})

const today = useToday()
const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short', day: 'numeric', ...(ymd.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
})
const price = (r: Recurring) => `${r.varies ? 'About ' : ''}${formatCents(r.amount_cents)} ${cadenceOf(r.cadence).every}`
const when = (r: Recurring) => (r.next < today ? `Expected ${day(r.next)}` : `Next ${day(r.next)}`)
const where = (r: Recurring) => (props.account ? '' : props.names.get(r.account) ?? '')
</script>

<template>
  <section class="group" aria-labelledby="recurring-title">
    <h2 id="recurring-title" class="group-title">Recurring</h2>
    <p v-if="error" class="notice notice-error" role="alert">{{ errorMessage(error) }}</p>
    <div v-else-if="!data.items.length && !data.stopped.length" class="card card-pad">
      <p class="muted">No subscriptions or bills found yet. Once something charges about the same amount on a steady schedule three times, it shows up here.</p>
    </div>
    <template v-else>
      <div class="card">
        <div v-if="data.items.length" class="card-pad tight">
          <p class="footnote">Subscriptions and bills</p>
          <p class="num title-2" :class="spendTone(data.yearly_cents)">{{ formatCents(data.yearly_cents) }} a year</p>
          <p class="footnote">About {{ formatCents(data.monthly_cents) }} a month, {{ data.items.length }} in all</p>
        </div>
        <ul class="list">
          <li v-for="r in data.items" :key="r.key" class="row item">
            <span class="row-label">
              <span class="block name">{{ r.name }}</span>
              <span class="footnote">{{ cadenceOf(r.cadence).label }} · {{ when(r) }}<template v-if="where(r)"> · {{ where(r) }}</template></span>
              <span v-if="r.change" class="footnote block change" :class="spendTone(r.change.to_cents - r.change.from_cents)">
                {{ r.change.to_cents > r.change.from_cents ? 'Up' : 'Down' }} from {{ formatCents(r.change.from_cents) }} on {{ day(r.change.on) }}
              </span>
            </span>
            <span class="side">
              <span class="num" :class="spendTone(r.amount_cents)">{{ price(r) }}</span>
              <span class="footnote num">{{ formatCents(r.yearly_cents) }} a year</span>
            </span>
          </li>
        </ul>
      </div>
      <template v-if="data.stopped.length">
        <h3 class="group-title sub">Stopped</h3>
        <ul class="card list">
          <li v-for="r in data.stopped" :key="r.key" class="row item">
            <span class="row-label">
              <span class="block name">{{ r.name }}</span>
              <span class="footnote">Last charged {{ day(r.last) }}, nothing since<template v-if="where(r)"> · {{ where(r) }}</template></span>
            </span>
            <span class="side">
              <span class="num muted">{{ price(r) }}</span>
            </span>
          </li>
        </ul>
      </template>
    </template>
    <p class="group-footer">Found from charges that come at a steady pace: weekly, every two weeks, monthly, every three months or yearly. A bill that changes every time shows its average.</p>
  </section>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.card-pad + .list, .list > li + li { border-top: var(--border); }
.tight > * { margin: 0; }
.tight > * + * { margin-top: 0.25rem; }
.item { align-items: flex-start; }
.name { overflow-wrap: anywhere; }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; text-align: right; white-space: nowrap; }
.change { margin-top: 0.125rem; }
.sub { margin-top: 1rem; }
</style>
