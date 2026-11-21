<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import type { Overview } from '~~/shared/overview'

// Overview's income and spending, month by month: two bars a month on one
// scale. The month picked here (`month`, '' for the latest) is the one the
// category card beside it shows.

const props = defineProps<{ months: Overview['months'] }>()
const selected = defineModel<string>('month', { default: '' })

const hasMonths = computed(() => props.months.some(m => m.income_cents || m.spent_cents))
function niceCeiling(cents: number) {
  if (cents <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(cents))
  return ([1, 2, 2.5, 5, 10].find(s => s * p >= cents) ?? 10) * p
}
const top = computed(() => niceCeiling(Math.max(...props.months.map(m => Math.max(m.income_cents, m.spent_cents)), 0)))
const height = (cents: number) => `${Math.max(0, Math.min(100, (cents / top.value) * 100))}%`
const shown = computed(() => props.months.find(m => m.month === selected.value) ?? props.months.at(-1))
const compact = compactCents
</script>

<template>
  <section class="card panel chart-area" aria-labelledby="flow-title">
    <div class="panel-head">
      <h2 id="flow-title" class="panel-title">Income and spending</h2>
      <span class="head-tools">
        <NuxtLink to="/trends" class="panel-link">Trends</NuxtLink>
        <template v-if="hasMonths && shown">
          <label class="visually-hidden" for="month-pick">Month</label>
          <select id="month-pick" class="select month-pick" :value="shown.month" @change="selected = ($event.target as HTMLSelectElement).value">
            <option v-for="m in months" :key="m.month" :value="m.month">{{ monthName(m.month) }}</option>
          </select>
        </template>
      </span>
    </div>
    <div v-if="hasMonths && shown" class="card-pad">
      <div class="legend" aria-hidden="true">
        <span><i class="key income" /> Income</span>
        <span><i class="key spent" /> Spending</span>
      </div>
      <div class="chart" aria-hidden="true">
        <div class="axis">
          <span>{{ compact(top) }}</span>
          <span>{{ compact(top / 2) }}</span>
          <span>$0</span>
        </div>
        <div class="plot">
          <div class="grid"><i /><i /><i /></div>
          <button
            v-for="m in months" :key="m.month" class="month" :class="{ on: shown.month === m.month }" tabindex="-1"
            @click="selected = m.month" @mouseenter="selected = m.month"
          >
            <span class="bars">
              <span class="bar income" :style="{ height: height(m.income_cents) }" />
              <span class="bar spent" :style="{ height: height(m.spent_cents) }" />
            </span>
            <span class="tick-label">{{ m.label.slice(0, 1) }}<span class="wide">{{ m.label.slice(1) }}</span></span>
          </button>
        </div>
      </div>
      <dl class="figures" aria-live="polite">
        <div><dt>Income</dt><dd class="num" :class="moneyTone(shown.income_cents)">{{ formatCents(shown.income_cents) }}</dd></div>
        <div><dt>Spending</dt><dd class="num" :class="spendTone(shown.spent_cents)">{{ formatCents(shown.spent_cents) }}</dd></div>
        <div>
          <dt>{{ shown.income_cents >= shown.spent_cents ? 'Kept' : 'Over' }}</dt>
          <dd class="num" :class="moneyTone(shown.income_cents - shown.spent_cents)">{{ formatCents(Math.abs(shown.income_cents - shown.spent_cents)) }}</dd>
        </div>
      </dl>
      <div class="visually-hidden">
        <table>
          <caption>Income and spending by month</caption>
          <thead><tr><th>Month</th><th>Income</th><th>Spending</th></tr></thead>
          <tbody>
            <tr v-for="m in months" :key="m.month"><td>{{ monthName(m.month) }}</td><td>{{ formatCents(m.income_cents) }}</td><td>{{ formatCents(m.spent_cents) }}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="caption">Moving money between your own accounts counts as neither.</p>
    </div>
    <div v-else class="card-pad">
      <p class="footnote">Each month's income and spending shows here once your accounts have transactions from the last year.</p>
    </div>
  </section>
</template>

<style scoped>
/* The chart's two series are money's colours, whatever the theme: income green, spending red. */
.chart, .legend { --income: var(--gain); --spent: var(--loss); }
.legend { display: flex; gap: 1rem; font-size: 0.8125rem; color: var(--text-2); }
.key { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: 3px; margin-right: 0.25rem; vertical-align: -0.05rem; }
.key.income { background: var(--income); }
.key.spent { background: var(--spent); }
.chart { display: flex; gap: 0.5rem; height: 12rem; margin-top: 0.75rem; }
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
.bars { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 2px; border-radius: 4px 4px 0 0; padding: 0 2px; }
.bar { width: min(0.625rem, 40%); border-radius: 3px 3px 0 0; min-height: 0; }
.bar.income { background: var(--income); }
.bar.spent { background: var(--spent); }
.tick-label { height: 1.375rem; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; }
.month.on .tick-label { font-weight: 600; }
.head-tools { display: inline-flex; align-items: center; gap: 0.75rem; }
.month-pick { width: auto; min-height: 2.25rem; font-size: 0.875rem; }
.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 1rem 0 0.75rem; padding-top: 1rem; border-top: var(--border); }
.figures dt { font-size: 0.8125rem; color: var(--text-2); }
.figures dd { margin: 0; font-size: 1.125rem; font-weight: 600; }
.caption { margin: 0; }
@media (max-width: 560px) {
  .wide { display: none; }
}
</style>
