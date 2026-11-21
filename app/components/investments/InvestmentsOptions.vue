<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import type { OptionContract } from '~~/shared/investment-history'

// Options contract by contract (shared/investment-history.ts optionContracts):
// open ones and what they're worth now, and how each closed one turned into
// cash (sold, expired, exercised or assigned), with its gain or loss.
const props = defineProps<{ options: OptionContract[], accountName: (id: string) => string, today: string }>()

const open = computed(() => props.options.filter(o => o.status === 'open'))
const ended = computed(() => props.options.filter(o => o.status !== 'open'))
const FIRST = 8
const all = ref(false)
const endedShown = computed(() => (all.value ? ended.value : ended.value.slice(0, FIRST)))
const yearAgo = computed(() => {
  const d = new Date(`${props.today}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() - 1)
  return d.toISOString().slice(0, 10)
})
const lastYear = computed(() => ended.value.filter(o => o.ended >= yearAgo.value && o.result_cents !== null))
const lastYearTotal = computed(() => lastYear.value.reduce((n, o) => n + o.result_cents!, 0))
const several = computed(() => new Set(props.options.map(o => o.account)).size > 1)

const day = (date: string) => (date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '')
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))
const qty = (n: number) => Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 4 })
const HOW: Record<OptionContract['status'], string> = { open: 'Open', closed: 'Closed', expired: 'Expired', exercised: 'Exercised', assigned: 'Assigned' }
function detail(o: OptionContract) {
  const held = o.status === 'open' ? `${qty(o.quantity)} ${o.quantity < 0 ? 'written' : 'held'}` : ''
  const when = o.status === 'open' ? (o.opened && `since ${day(o.opened)}`) : `${HOW[o.status]} ${day(o.ended)}`
  return [held, when, several.value && props.accountName(o.account)].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="card panel" aria-labelledby="options-title" data-test="options">
    <div class="panel-head">
      <h2 id="options-title" class="panel-title">Options</h2>
      <span v-if="lastYear.length" class="footnote">
        Ended in the last 12 months: <span class="num" :class="moneyTone(lastYearTotal)" data-test="options-year">{{ signed(lastYearTotal) }}</span>
      </span>
    </div>
    <template v-if="open.length">
      <h3 class="group-title">Open</h3>
      <ul class="list">
        <li v-for="o in open" :key="`${o.account}|${o.security}`" class="row">
          <span class="row-label">
            <span class="block">{{ o.name || o.ticker }}</span>
            <span class="caption">{{ detail(o) }}</span>
          </span>
          <span class="figures">
            <span class="num block">{{ o.value_cents === null ? '—' : formatCents(o.value_cents) }}</span>
            <span v-if="o.result_cents !== null" class="num caption" :class="moneyTone(o.result_cents)" title="What it's worth now plus the cash it's brought in or taken">{{ signed(o.result_cents) }} so far</span>
          </span>
        </li>
      </ul>
    </template>
    <template v-if="ended.length">
      <h3 class="group-title">Ended</h3>
      <ul class="list" data-test="options-ended">
        <li v-for="o in endedShown" :key="`${o.account}|${o.security}`" class="row">
          <span class="row-label">
            <span class="block">{{ o.name || o.ticker }}</span>
            <span class="caption">{{ detail(o) }}</span>
          </span>
          <span class="figures">
            <span v-if="o.result_cents !== null" class="num block" :class="moneyTone(o.result_cents)">{{ signed(o.result_cents) }}</span>
            <span v-else class="num block muted" title="Opened before the activity Cheddar has, so what it cost isn't known">—</span>
            <span class="caption">{{ o.result_cents === null ? 'Opened before Cheddar\'s records' : 'Cash in less cash out' }}</span>
          </span>
        </li>
      </ul>
      <div v-if="ended.length > FIRST" class="card-pad more">
        <button type="button" class="btn btn-tinted" :aria-expanded="all" @click="all = !all">{{ all ? 'Show fewer' : `Show all ${ended.length}` }}</button>
      </div>
    </template>
    <p class="footnote card-pad note">
      Each contract's result is the premiums and trades' cash in less out, plus what an open one is worth now.
      Shares an exercise or assignment brought in or took out are with your holdings, not here.
    </p>
  </section>
</template>

<style scoped>
.panel { margin-bottom: 1.5rem; }
.group-title { margin: 0; padding: 0.75rem 1.25rem 0.25rem; font-size: 0.8125rem; font-weight: 600; color: var(--text-2); }
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.figures { display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; text-align: right; }
.more { padding-top: 0.75rem; }
.note { margin: 0; }
</style>
