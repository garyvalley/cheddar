<script setup lang="ts">
import { formatCents, kindLabel, type AccountKind } from '~~/shared/accounts'
import type { BankLinks } from '~~/shared/bank-links'
import type { Investments } from '~~/shared/investments'
import { GROWTH_PERIODS, type GrowthPeriodId } from '~~/shared/overview'

// The brokerage and retirement accounts on their own: what they hold, how
// they grew, and their value month by month. Read only: they're linked in
// Settings and added or edited there too.
const { data, error } = await useFetch<Investments>('/api/investments')
const { data: links } = await useFetch<BankLinks>('/api/bank-links', { key: 'bank-links', default: () => ({ enabled: false, links: [] }) })

const period = ref<GrowthPeriodId>('1y')
const grown = computed(() => data.value?.growth.find(g => g.period === period.value))
const periodName = computed(() => GROWTH_PERIODS.find(p => p.id === period.value)?.name ?? '')
const growthOf = (a: Investments['accounts'][number]) => a.growth.find(g => g.period === period.value)

const accounts = computed(() => data.value?.accounts ?? [])
const any = computed(() => accounts.value.some(a => a.balance_cents !== null))

const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))
const percent = (rate: number) => `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${Math.abs(rate * 100).toFixed(Math.abs(rate) < 0.1 ? 2 : 1)}%`
const detail = (a: Investments['accounts'][number]) => [kindLabel(a.kind as AccountKind), a.institution, a.last4 && `••${a.last4}`, a.closed_on && `Closed ${day(a.closed_on)}`].filter(Boolean).join(' · ')

// Value at each month's end, as bars on one scale from $0.
const months = computed(() => data.value?.months ?? [])
const valued = computed(() => months.value.filter(m => m.value_cents !== null).length)
function niceCeiling(cents: number) {
  if (cents <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(cents))
  return ([1, 2, 2.5, 5, 10].find(s => s * p >= cents) ?? 10) * p
}
const top = computed(() => niceCeiling(Math.max(...months.value.map(m => m.value_cents ?? 0), 0)))
const height = (cents: number | null) => `${Math.max(0, Math.min(100, ((cents ?? 0) / top.value) * 100))}%`
const compact = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
const picked = ref('')
const shown = computed(() => months.value.find(m => m.month === picked.value) ?? months.value.at(-1))
const monthName = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
</script>

<template>
  <div>
    <AppHeader title="Investments" sub="Your brokerage and retirement accounts, and how they've grown." />

    <p v-if="error" class="notice notice-error" role="alert">{{ errorMessage(error) }}</p>

    <section v-else-if="!any" class="card card-pad empty" aria-labelledby="none-title">
      <h2 id="none-title" class="headline">No investment accounts yet</h2>
      <p class="footnote">
        Link your brokerage or retirement account, and what it holds and how it grows show up here.
        For one that can't be linked, add it in <NuxtLink to="/settings#accounts">Settings</NuxtLink> and enter its balance now and then.
      </p>
      <div class="btn-row">
        <NuxtLink v-if="links.enabled && !links.full" :to="{ path: '/settings', query: { link: '1' }, hash: '#linked-banks' }" class="btn btn-primary">Link a brokerage</NuxtLink>
        <NuxtLink to="/settings#accounts" class="btn btn-tinted">Go to your accounts</NuxtLink>
      </div>
    </section>

    <template v-else-if="data">
      <div class="tiles">
        <section class="card tile" aria-labelledby="value-title">
          <div class="tile-head"><h2 id="value-title" class="tile-label">Invested</h2></div>
          <p class="num tile-value" data-test="invested">{{ formatCents(data.total_cents) }}</p>
          <p class="footnote">As of {{ day(data.as_of) }}</p>
        </section>

        <section class="card tile" aria-labelledby="growth-title">
          <div class="tile-head">
            <h2 id="growth-title" class="tile-label">Growth</h2>
            <label class="visually-hidden" for="growth-period">Over</label>
            <select id="growth-period" v-model="period" class="select tile-pick">
              <option v-for="p in GROWTH_PERIODS" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </div>
          <template v-if="grown && grown.rate !== null">
            <p class="num tile-value" :class="moneyTone(grown.gain_cents)" data-test="growth">{{ percent(grown.rate) }}</p>
            <p class="footnote"><span class="num" :class="moneyTone(grown.gain_cents)">{{ signed(grown.gain_cents) }}</span> over {{ periodName }}</p>
          </template>
          <template v-else>
            <p class="num tile-value muted">—</p>
            <p class="footnote">Shows once Cheddar has seen these balances on more than one day.</p>
          </template>
        </section>

        <section class="card tile" aria-labelledby="moved-title">
          <div class="tile-head"><h2 id="moved-title" class="tile-label">Moved in</h2></div>
          <template v-if="grown && grown.since">
            <p class="num tile-value">{{ signed(grown.added_cents) }}</p>
            <p class="footnote">Transfers in less out, since {{ day(grown.since) }}. They aren't growth.</p>
          </template>
          <template v-else>
            <p class="num tile-value muted">—</p>
            <p class="footnote">Money you move in or out, which growth leaves out.</p>
          </template>
        </section>
      </div>

      <section class="card panel" aria-labelledby="history-title">
        <div class="panel-head">
          <h2 id="history-title" class="panel-title">Value by month</h2>
          <span v-if="shown" class="footnote" aria-live="polite">
            {{ monthName(shown.month) }}: <span class="num">{{ shown.value_cents === null ? '—' : formatCents(shown.value_cents) }}</span>
          </span>
        </div>
        <div class="card-pad">
          <div class="chart" aria-hidden="true">
            <div class="axis">
              <span>{{ compact(top) }}</span>
              <span>{{ compact(top / 2) }}</span>
              <span>$0</span>
            </div>
            <div class="plot">
              <div class="grid"><i /><i /><i /></div>
              <button
                v-for="m in months" :key="m.month" class="month" :class="{ on: shown?.month === m.month }" tabindex="-1"
                @click="picked = m.month" @mouseenter="picked = m.month"
              >
                <span class="bars"><span v-if="m.value_cents !== null" class="bar" :style="{ height: height(m.value_cents) }" /></span>
                <span class="tick-label">{{ m.label.slice(0, 1) }}<span class="wide">{{ m.label.slice(1) }}</span></span>
              </button>
            </div>
          </div>
          <p v-if="valued < 2" class="footnote chart-note">Each month fills in as Cheddar sees your balances. Linked accounts add one every day.</p>
          <div class="visually-hidden">
            <table>
              <caption>Value of your investment accounts at each month's end</caption>
              <thead><tr><th>Month</th><th>Value</th></tr></thead>
              <tbody>
                <tr v-for="m in months" :key="m.month"><td>{{ monthName(m.month) }}</td><td>{{ m.value_cents === null ? 'No balance yet' : formatCents(m.value_cents) }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="card panel" aria-labelledby="accounts-title">
        <div class="panel-head">
          <h2 id="accounts-title" class="panel-title">Accounts</h2>
          <NuxtLink to="/settings#accounts" class="panel-link">Edit in Settings</NuxtLink>
        </div>
        <ul class="list">
          <li v-for="a in accounts" :key="a.id" class="row">
            <span class="row-label">
              <span class="block">{{ a.name }} <span v-if="a.linked" class="badge">Linked</span></span>
              <span class="caption">{{ detail(a) }}</span>
            </span>
            <span class="figures">
              <span class="num block" :class="a.balance_cents === null ? 'muted' : ''">{{ a.balance_cents === null ? 'No balance' : formatCents(a.balance_cents) }}</span>
              <span v-if="growthOf(a)?.rate != null" class="num caption" :class="moneyTone(growthOf(a)!.gain_cents)">{{ percent(growthOf(a)!.rate!) }} {{ GROWTH_PERIODS.find(p => p.id === period)?.label }}</span>
            </span>
          </li>
        </ul>
      </section>
      <p class="group-footer">
        Growth is the change in value less money moved in or out, so deposits don't count as gains.
        Values are each account's balance as its bank reports it; Cheddar doesn't read individual holdings.
      </p>
    </template>
  </div>
</template>

<style scoped>
.empty { display: grid; gap: 0.5rem; justify-items: start; }
.empty > * { margin: 0; }
.tiles { display: grid; gap: 1.5rem; grid-template-columns: repeat(3, 1fr); margin-bottom: 1.5rem; }
.tile { min-width: 0; padding: 1rem 1.25rem 1.25rem; display: grid; gap: 0.375rem; align-content: start; }
.tile > p { margin: 0; }
.tile-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.75rem; }
.tile-label { margin: 0; font-size: 1rem; font-weight: 600; }
.tile-value { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
.tile-pick { width: auto; min-height: 1.75rem; padding: 0.125rem 0.5rem; font-size: 0.8125rem; }
.panel { margin-bottom: 1.5rem; }

/* Value is one series, in the theme's accent: green and red mean gain and loss only. */
.chart { display: flex; gap: 0.5rem; height: 12rem; }
.axis {
  display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 1.375rem;
  font-size: 0.6875rem; color: var(--text-3); text-align: right; font-variant-numeric: tabular-nums;
}
.axis span { line-height: 0; }
.plot { position: relative; flex: 1; display: flex; min-width: 0; }
.grid { position: absolute; inset: 0 0 1.375rem; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.grid i { border-top: var(--border); }
.grid i:last-child { border-top-color: var(--text-3); }
.month {
  position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: stretch;
  border: 0; background: none; padding: 0; font: inherit; cursor: pointer; color: var(--text-3);
}
.month.on { color: var(--text); }
.month.on .bars { background: var(--surface-2); }
.bars { flex: 1; display: flex; align-items: flex-end; justify-content: center; border-radius: 4px 4px 0 0; padding: 0 2px; }
.bar { width: min(1.25rem, 60%); border-radius: 3px 3px 0 0; background: var(--accent); }
.tick-label { height: 1.375rem; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; }
.month.on .tick-label { font-weight: 600; }
.chart-note { margin: 0.75rem 0 0; }

.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.figures { display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; text-align: right; }

@media (max-width: 760px) {
  .tiles { grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .tiles > :first-child { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .wide { display: none; }
  .tile { padding: 0.875rem 1rem 1rem; }
  .tile-value { font-size: 1.5rem; }
}
</style>
