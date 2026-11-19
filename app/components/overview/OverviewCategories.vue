<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import type { SpendingSummary } from '~~/shared/categories'

// Overview's spending by category for the month the chart shows (`month`,
// YYYY-MM, or '' before there is one): the five largest, the rest as "Other".

const props = defineProps<{ spending: SpendingSummary, month: string }>()

const SLICES = 5
const slices = computed(() => {
  const spent = props.spending.categories.filter(c => c.spending && c.total_cents > 0)
  const total = spent.reduce((n, c) => n + c.total_cents, 0)
  if (!total) return []
  const head = spent.slice(0, SLICES).map((c, i) => ({ id: c.id, label: c.label, cents: c.total_cents, color: `var(--slice-${i + 1})` }))
  const rest = spent.slice(SLICES).reduce((n, c) => n + c.total_cents, 0)
  if (rest) head.push({ id: 'other', label: 'Other', cents: rest, color: 'var(--slice-other)' })
  let at = 0
  return head.map((c) => {
    const share = (c.cents / total) * 100
    const slice = { ...c, share, start: at }
    at += share
    return slice
  })
})
const pieTotal = computed(() => slices.value.reduce((n, c) => n + c.cents, 0))
const hovered = ref('')
// A 2-unit gap of card between slices, unless one slice is the whole.
const dash = (share: number) => {
  const len = Math.max(0.01, slices.value.length > 1 ? share - 1.2 : share)
  return `${len} ${100 - len}`
}
const share = (n: number) => `${n < 1 ? '<1' : Math.round(n)}%`
const compact = compactCents
const shown = computed(() => (props.month ? { month: props.month } : null))
</script>

<template>
  <section class="card panel pie-area" aria-labelledby="cats-title">
    <div class="panel-head">
      <h2 id="cats-title" class="panel-title">Spending by category{{ shown ? `, ${monthName(shown.month).split(' ')[0]}` : '' }}</h2>
      <NuxtLink v-if="shown" :to="{ path: '/spending', query: { at: shown.month } }" class="panel-link">See all</NuxtLink>
    </div>
    <div v-if="slices.length" class="card-pad pie-wrap">
      <svg class="pie" viewBox="0 0 42 42" role="img" :aria-label="`Spending by category: ${slices.map(c => `${c.label} ${formatCents(c.cents)}`).join(', ')}`">
        <circle class="pie-track" cx="21" cy="21" r="15.9155" />
        <circle
          v-for="c in slices" :key="c.id" class="pie-slice" :class="{ dim: hovered && hovered !== c.id }"
          cx="21" cy="21" r="15.9155" :stroke="c.color" :stroke-dasharray="dash(c.share)" :stroke-dashoffset="25 - c.start"
          @mouseenter="hovered = c.id" @mouseleave="hovered = ''"
        ><title>{{ c.label }}: {{ formatCents(c.cents) }} ({{ share(c.share) }})</title></circle>
        <text x="21" y="20.5" class="pie-total">{{ compact(pieTotal) }}</text>
        <text x="21" y="25.5" class="pie-sub">spent</text>
      </svg>
      <ul class="pie-legend">
        <li v-for="c in slices" :key="c.id" :class="{ dim: hovered && hovered !== c.id }" @mouseenter="hovered = c.id" @mouseleave="hovered = ''">
          <i class="swatch" :style="{ background: c.color }" aria-hidden="true" />
          <span class="pie-name">{{ c.label }}</span>
          <span class="num">{{ formatCents(c.cents) }}</span>
          <span class="num pie-share">{{ share(c.share) }}</span>
        </li>
      </ul>
    </div>
    <div v-else class="card-pad">
      <p class="footnote">Nothing spent{{ shown ? ` in ${monthName(shown.month)}` : '' }} yet.</p>
    </div>
  </section>
</template>

<style scoped>
/*
 * Category slices: categorical hues in a fixed order, checked for colour
 * blindness and told apart from money's green and red (which mean gain and
 * loss, not a category). The legend beside them names each one with its amount.
 */
.pie-wrap {
  --slice-1: light-dark(#2a78d6, #3987e5); --slice-2: light-dark(#eb6834, #d95926); --slice-3: light-dark(#6250d6, #9085e9);
  --slice-4: light-dark(#eda100, #c98500); --slice-5: light-dark(#e87ba4, #d55181); --slice-other: var(--text-3);
  display: flex; align-items: center; justify-content: center; gap: 2rem; flex-wrap: wrap;
}
.pie { width: 10rem; height: 10rem; flex: none; }
.pie-track { fill: none; stroke: var(--surface-2); stroke-width: 6; }
.pie-slice { fill: none; stroke-width: 6; transition: opacity 0.15s; cursor: default; }
.pie-total { font-size: 5px; font-weight: 700; text-anchor: middle; fill: var(--text); font-variant-numeric: tabular-nums; }
.pie-sub { font-size: 3px; text-anchor: middle; fill: var(--text-2); }
.pie-legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 12rem; max-width: 26rem; display: grid; gap: 0.5rem; }
.pie-legend li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; transition: opacity 0.15s; }
.pie-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pie-share { width: 2.75rem; text-align: right; color: var(--text-2); font-size: 0.8125rem; }
.swatch { width: 0.625rem; height: 0.625rem; border-radius: 3px; flex: none; }
.dim { opacity: 0.35; }
/* Beside the chart on a wide screen, the legend goes under the pie. */
@media (min-width: 900px) {
  .pie-wrap { flex-direction: column; }
  .pie-legend { width: 100%; min-width: 0; }
}
</style>
