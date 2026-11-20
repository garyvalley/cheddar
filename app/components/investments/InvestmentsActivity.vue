<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { ACTIVITY_LABELS, type Activity } from '~~/shared/investing'

// Investments' buys, sells, dividends and the rest (shared/investing.ts), as
// each brokerage reports them through Plaid. Kept apart from Spending: none
// of it is spending or income there.
const props = defineProps<{
  rows: Activity[]
  income12m: number
  accountName: (id: string) => string
}>()

const FIRST = 12
const all = ref(false)
const shown = computed(() => (all.value ? props.rows : props.rows.slice(0, FIRST)))
const several = computed(() => new Set(props.rows.map(r => r.account)).size > 1)
const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const qty = (n: number) => Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 4 })
// Only what's paid to you or taken from you is gain or loss: a buy or a sale trades one holding for cash.
const tone = (r: Activity) => (r.kind === 'dividend' || r.kind === 'interest' ? 'gain' : r.kind === 'fee' ? 'loss' : '')
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))
/** "Sold BND", "Dividend from VTI", or the kind alone. */
function title(r: Activity) {
  const security = r.ticker || r.security
  if (!security) return ACTIVITY_LABELS[r.kind]
  return r.kind === 'dividend' || r.kind === 'interest' ? `${ACTIVITY_LABELS[r.kind]} from ${security}` : `${ACTIVITY_LABELS[r.kind]} ${security}`
}
function detail(r: Activity) {
  const shares = r.quantity && (r.kind === 'buy' || r.kind === 'sell') ? `${qty(r.quantity)} ${Math.abs(r.quantity) === 1 ? 'share' : 'shares'}` : ''
  const price = shares && r.price_cents ? `at ${formatCents(r.price_cents)}` : ''
  // The bank's own words say most about a deposit, a fee or the like.
  const said = r.ticker || r.security ? '' : r.name
  return [day(r.date), [shares, price].filter(Boolean).join(' '), said, several.value && props.accountName(r.account)].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="card panel" aria-labelledby="activity-title" data-test="activity">
    <div class="panel-head">
      <h2 id="activity-title" class="panel-title">Activity</h2>
      <span v-if="income12m" class="footnote" data-test="income">Dividends and interest, last 12 months: <span class="num gain">{{ formatCents(income12m) }}</span></span>
    </div>
    <ul v-if="rows.length" class="list">
      <li v-for="r in shown" :key="r.id" class="row">
        <span class="row-label">
          <span class="block">{{ title(r) }}</span>
          <span class="caption">{{ detail(r) }}</span>
        </span>
        <span class="num" :class="tone(r)">{{ signed(r.amount_cents) }}</span>
      </li>
    </ul>
    <p v-else class="footnote card-pad">Buys, sells and dividends show here once a linked brokerage reports them.</p>
    <div v-if="rows.length > FIRST" class="card-pad more">
      <button type="button" class="btn btn-tinted" :aria-expanded="all" @click="all = !all">{{ all ? 'Show fewer' : `Show all ${rows.length}` }}</button>
    </div>
  </section>
</template>

<style scoped>
.panel { margin-bottom: 1.5rem; }
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.more { padding-top: 0.75rem; }
</style>
