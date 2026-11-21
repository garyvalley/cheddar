<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { GRAINS, type Grain, type TimelinePeriod } from '~~/shared/investment-history'

// Investments month by month or quarter by quarter (shared/investment-history.ts):
// the value at each end, how much of the change was the market and how much
// money moved in, and what was held, share by share, against the period before.
const props = defineProps<{ timeline: Record<Grain, TimelinePeriod[]>, holdingsOn: boolean }>()

const grain = ref<Grain>('month')
const periods = computed(() => props.timeline[grain.value] ?? [])
const picked = ref('')
watch(grain, () => { picked.value = '' })
const shown = computed(() => periods.value.find(p => p.id === picked.value) ?? periods.value.at(-1))
const index = computed(() => (shown.value ? periods.value.indexOf(shown.value) : -1))
const valued = computed(() => periods.value.filter(p => p.value_cents !== null).length)
const anyEstimated = computed(() => periods.value.some(p => p.estimated))
const step = (by: number) => {
  const next = periods.value[index.value + by]
  if (next) picked.value = next.id
}

function niceCeiling(cents: number) {
  if (cents <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(cents))
  return ([1, 2, 2.5, 5, 10].find(s => s * p >= cents) ?? 10) * p
}
const top = computed(() => niceCeiling(Math.max(...periods.value.map(p => p.value_cents ?? 0), 0)))
const height = (cents: number | null) => `${Math.max(0, Math.min(100, ((cents ?? 0) / top.value) * 100))}%`
// Gains and losses on one scale, from a middle line: green up, red down.
const swing = computed(() => Math.max(...periods.value.map(p => Math.abs(p.gain_cents ?? 0)), 1))
const swingHeight = (cents: number | null) => `${Math.min(50, (Math.abs(cents ?? 0) / swing.value) * 50)}%`

const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })
const signedQty = (n: number) => (n > 0 ? `+${qty(n)}` : qty(n))
const periodWord = computed(() => (grain.value === 'quarter' ? 'quarter' : 'month'))
const gainRate = (p: TimelinePeriod) => {
  const start = p.value_cents !== null && p.change_cents !== null ? p.value_cents - p.change_cents : null
  return p.gain_cents !== null && start ? p.gain_cents / start : null
}
const percent = (rate: number) => `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${Math.abs(rate * 100).toFixed(1)}%`
/** "+5 shares", "New", "Sold out". */
function sharesMoved(h: TimelinePeriod['holdings'][number]) {
  if (h.quantity_change === null || Math.abs(h.quantity_change) < 1e-9) return ''
  if (Math.abs(h.quantity) < 1e-9) return 'Sold out'
  if (Math.abs(h.quantity - h.quantity_change) < 1e-9) return 'New'
  return signedQty(h.quantity_change)
}
</script>

<template>
  <section class="card panel" aria-labelledby="timeline-title" data-test="timeline">
    <div class="panel-head">
      <h2 id="timeline-title" class="panel-title">Over time</h2>
      <div class="segmented" role="group" aria-label="Show by">
        <button v-for="g in GRAINS" :key="g.id" type="button" class="seg" :aria-pressed="grain === g.id" @click="grain = g.id">{{ g.label }}</button>
      </div>
    </div>
    <div class="card-pad">
      <div class="chart" aria-hidden="true">
        <div class="axis">
          <span>{{ compactCents(top) }}</span>
          <span>{{ compactCents(top / 2) }}</span>
          <span>$0</span>
        </div>
        <div class="plot">
          <div class="grid"><i /><i /><i /></div>
          <button
            v-for="p in periods" :key="p.id" class="period" :class="{ on: shown?.id === p.id }" tabindex="-1"
            @click="picked = p.id" @mouseenter="picked = p.id"
          >
            <span class="bars"><span v-if="p.value_cents !== null" class="bar" :class="{ est: p.estimated }" :style="{ height: height(p.value_cents) }" /></span>
            <span class="swing">
              <span v-if="p.gain_cents" class="move" :class="moneyTone(p.gain_cents)" :style="{ height: swingHeight(p.gain_cents) }" />
            </span>
            <span class="tick-label">{{ p.short.slice(0, grain === 'quarter' ? 2 : 1) }}<span class="wide">{{ p.short.slice(grain === 'quarter' ? 2 : 1) }}</span></span>
          </button>
        </div>
      </div>
      <p class="footnote chart-key">Bars are the value at each {{ periodWord }}'s end; below them, what the market did (<span class="gain">up</span> or <span class="loss">down</span>), leaving out money moved in or out.<template v-if="anyEstimated"> Paler bars are estimates, from before Cheddar kept your balances.</template></p>
      <p v-if="valued < 2" class="footnote">Values fill in as Cheddar sees your balances, one a day for a linked account. Before that they're estimated from your brokerage's activity, as far back as it goes.</p>

      <div v-if="shown" class="picked" aria-live="polite" data-test="timeline-period">
        <div class="picked-head">
          <button type="button" class="btn btn-plain step" :disabled="index <= 0" aria-label="Earlier" @click="step(-1)">‹</button>
          <h3 class="headline">{{ shown.label }}</h3>
          <button type="button" class="btn btn-plain step" :disabled="index >= periods.length - 1" aria-label="Later" @click="step(1)">›</button>
        </div>
        <dl class="figures">
          <div>
            <dt>Value at the end</dt>
            <dd class="num" data-test="period-value">{{ shown.value_cents === null ? '—' : `${shown.estimated ? '≈ ' : ''}${formatCents(shown.value_cents)}` }}<span v-if="shown.estimated" class="caption"> estimated</span></dd>
          </div>
          <div>
            <dt>Market gain or loss</dt>
            <dd class="num" :class="shown.gain_cents === null ? 'muted' : moneyTone(shown.gain_cents)" data-test="period-gain">
              {{ shown.gain_cents === null ? '—' : signed(shown.gain_cents) }}
              <span v-if="gainRate(shown) !== null" class="caption">{{ percent(gainRate(shown)!) }}</span>
            </dd>
          </div>
          <div><dt>Moved in</dt><dd class="num">{{ signed(shown.moved_in_cents) }}</dd></div>
          <div><dt>Dividends and interest</dt><dd class="num" :class="moneyTone(shown.income_cents)">{{ signed(shown.income_cents) }}</dd></div>
          <div v-if="shown.bought_cents"><dt>Bought</dt><dd class="num">{{ formatCents(shown.bought_cents) }}</dd></div>
          <div v-if="shown.sold_cents"><dt>Sold</dt><dd class="num">{{ formatCents(shown.sold_cents) }}</dd></div>
          <div v-if="shown.options_cents || shown.options_ended">
            <dt>Options' cash</dt>
            <dd class="num">{{ signed(shown.options_cents) }}<span v-if="shown.options_ended" class="caption"> · {{ shown.options_ended }} ended</span></dd>
          </div>
        </dl>

        <template v-if="holdingsOn && shown.holdings.length">
          <table class="hold-table" data-test="period-holdings">
            <caption class="visually-hidden">Held at the end of {{ shown.label }}</caption>
            <thead><tr><th scope="col">Held at the end</th><th scope="col" class="r">Shares</th><th scope="col" class="r">Value</th></tr></thead>
            <tbody>
              <tr v-for="h in shown.holdings" :key="h.security" :class="{ gone: Math.abs(h.quantity) < 1e-9 }">
                <td>
                  <span class="block">{{ h.name }} <span v-if="h.option" class="badge">Option</span></span>
                  <span v-if="h.ticker && h.ticker !== h.name" class="caption">{{ h.ticker }}</span>
                </td>
                <td class="r num">
                  <span class="block">{{ Math.abs(h.quantity) < 1e-9 ? '0' : qty(h.quantity) }}</span>
                  <span v-if="sharesMoved(h)" class="caption">{{ sharesMoved(h) }}</span>
                </td>
                <td class="r num">
                  <span class="block" :class="h.value_cents === null ? 'muted' : ''">{{ h.value_cents === null ? '—' : formatCents(h.value_cents) }}</span>
                  <span v-if="h.value_change_cents" class="caption" :class="moneyTone(h.value_change_cents)" title="The market's part: buys and sales of it this period left out">{{ signed(h.value_change_cents) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="shown.valued" class="footnote">A holding's change in value is the market's part, with this {{ periodWord }}'s buys and sales of it left out.</p>
          <p v-if="!shown.valued" class="footnote">Cheddar hadn't kept each holding's value then: shares are worked back from what's held now and your brokerage's buys and sales since, and valued at each one's last trade price by then (or today's, for one not traded yet).</p>
        </template>
      </div>

      <details class="every">
        <summary>Every {{ periodWord }}</summary>
        <div class="table-wrap">
          <table class="every-table">
            <thead><tr><th scope="col">{{ grain === 'quarter' ? 'Quarter' : 'Month' }}</th><th scope="col" class="r">Value</th><th scope="col" class="r">Market</th><th scope="col" class="r">Moved in</th><th scope="col" class="r">Dividends</th></tr></thead>
            <tbody>
              <tr v-for="p in [...periods].reverse()" :key="p.id">
                <th scope="row"><button type="button" class="link-btn" @click="picked = p.id">{{ p.label }}</button></th>
                <td class="r num">{{ p.value_cents === null ? '—' : `${p.estimated ? '≈ ' : ''}${formatCents(p.value_cents)}` }}</td>
                <td class="r num" :class="p.gain_cents === null ? 'muted' : moneyTone(p.gain_cents)">{{ p.gain_cents === null ? '—' : signed(p.gain_cents) }}</td>
                <td class="r num">{{ p.moved_in_cents ? signed(p.moved_in_cents) : '—' }}</td>
                <td class="r num" :class="moneyTone(p.income_cents)">{{ p.income_cents ? signed(p.income_cents) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </section>
</template>

<style scoped>
.panel { margin-bottom: 1.5rem; }
.panel-head { flex-wrap: wrap; gap: 0.5rem; }

/* Value is one series, in the theme's accent: green and red mean gain and loss only. */
.chart { display: flex; gap: 0.5rem; height: 14rem; }
.axis {
  display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 5.375rem;
  font-size: 0.6875rem; color: var(--text-3); text-align: right; font-variant-numeric: tabular-nums;
}
.axis span { line-height: 0; }
.plot { position: relative; flex: 1; display: flex; min-width: 0; }
.grid { position: absolute; inset: 0 0 5.375rem; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.grid i { border-top: var(--border); }
.grid i:last-child { border-top-color: var(--text-3); }
.period {
  position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: stretch;
  border: 0; background: none; padding: 0; font: inherit; cursor: pointer; color: var(--text-3);
}
.period.on { color: var(--text); }
.period.on .bars, .period.on .swing { background: var(--surface-2); }
.bars { flex: 1; display: flex; align-items: flex-end; justify-content: center; border-radius: 4px 4px 0 0; padding: 0 2px; }
.bar { width: min(1.25rem, 60%); border-radius: 3px 3px 0 0; background: var(--accent); }
.bar.est { opacity: 0.45; }
.swing { position: relative; height: 4rem; border-bottom: var(--border); }
.swing::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; border-top: 1px dashed var(--text-3); opacity: 0.6; }
.move { position: absolute; left: 50%; transform: translateX(-50%); width: min(0.75rem, 45%); border-radius: 2px; }
.move.gain { bottom: 50%; background: var(--gain); }
.move.loss { top: 50%; background: var(--loss); }
.tick-label { height: 1.375rem; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; }
.period.on .tick-label { font-weight: 600; }
.chart-key { margin: 0.75rem 0 0; }

.picked { margin-top: 1.25rem; padding-top: 1rem; border-top: var(--border); }
.picked-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.picked-head .headline { margin: 0; min-width: 7rem; text-align: center; }
.step { min-height: 2rem; padding: 0 0.625rem; font-size: 1.125rem; }
.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem 1.5rem; margin: 0 0 1rem; }
.figures div { min-width: 0; }
.figures dt { font-size: 0.75rem; color: var(--text-2); }
.figures dd { margin: 0.125rem 0 0; font-size: 1.0625rem; font-weight: 600; }
.figures .caption { font-weight: 400; margin-left: 0.25rem; }

.hold-table, .every-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.hold-table th, .every-table thead th { font-size: 0.75rem; font-weight: 500; color: var(--text-2); text-align: left; padding: 0.25rem 0; }
.hold-table td, .every-table td, .every-table tbody th { padding: 0.375rem 0; border-top: var(--border); vertical-align: top; text-align: left; font-weight: 400; }
.hold-table .r, .every-table .r { text-align: right; padding-left: 0.75rem; white-space: nowrap; }
.gone td { color: var(--text-3); }
.every { margin-top: 1rem; }
.every summary { cursor: pointer; font-size: 0.875rem; color: var(--accent); }
.table-wrap { overflow-x: auto; margin-top: 0.5rem; }
.link-btn { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
.link-btn:hover { color: var(--accent); }

@media (max-width: 560px) {
  .wide { display: none; }
  .figures { grid-template-columns: 1fr 1fr; }
}
</style>
