<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { RANGES, checkRange, monthName, rangeMonths, type RangeId, type Report, type Series, type YearReview } from '~~/shared/reports'

// Reports (issue #108): trends Spending can't show, since it compares one
// span with the one before. Income against spending by month, one category
// or merchant over the months, where the income went, and a year in review.
// The sums are shared/reports.ts; the range lives in the address.

const route = useRoute()
const router = useRouter()
const today = useToday()
const text = (v: unknown) => (typeof v === 'string' ? v : '')

const preset = computed<RangeId | ''>(() => {
  if (route.query.from || route.query.to) return ''
  const r = text(route.query.range)
  return RANGES.some(x => x.id === r) ? r as RangeId : '12m'
})
const range = computed(() => {
  if (preset.value) return rangeMonths(preset.value, today)
  const c = checkRange(route.query.from, route.query.to)
  return 'problem' in c ? rangeMonths('12m', today) : c
})
const pick = (id: RangeId) => router.push({ query: { ...route.query, range: id === '12m' ? undefined : id, from: undefined, to: undefined } })
const custom = reactive({ from: range.value.from, to: range.value.to })
watch(range, r => Object.assign(custom, r))
const customOpen = ref(!preset.value)
const rangeProblem = ref('')
function showCustom() {
  const c = checkRange(custom.from, custom.to)
  rangeProblem.value = 'problem' in c ? c.problem : ''
  if ('problem' in c) return
  return router.push({ query: { ...route.query, range: undefined, from: c.from, to: c.to } })
}

const empty = (): Report => ({ from: '', to: '', months: [], income_cents: 0, spent_cents: 0, saved_percent: null, categories: [], merchants: [], flow: { income_cents: 0, to: [], saved_cents: 0, short_cents: 0 } })
const { data: report, pending, error } = await useFetch<Report>('/api/reports', {
  query: { from: computed(() => range.value.from), to: computed(() => range.value.to) },
  default: empty,
})
const span = computed(() => (range.value.from === range.value.to ? monthName(range.value.from) : `${monthName(range.value.from)} to ${monthName(range.value.to)}`))
const hasAny = computed(() => report.value.months.some(m => m.income_cents || m.spent_cents))

// Money in this report's charts, briefly: "$1.2K".
const compact = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
function niceCeiling(cents: number) {
  if (cents <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(cents))
  return ([1, 2, 2.5, 5, 10].find(s => s * p >= cents) ?? 10) * p
}
const many = computed(() => report.value.months.length > 13)
const tick = (month: string) => monthName(month, true)

// Income against spending.
const top = computed(() => niceCeiling(Math.max(0, ...report.value.months.map(m => Math.max(m.income_cents, m.spent_cents)))))
const height = (cents: number, of: number) => `${Math.max(0, Math.min(100, (cents / of) * 100))}%`
const kept = computed(() => report.value.income_cents - report.value.spent_cents)
const avgSpent = computed(() => Math.round(report.value.spent_cents / Math.max(1, report.value.months.length)))

// One category or merchant over the months.
const kind = ref<'category' | 'merchant'>('category')
const which = ref('')
const choices = computed<Series[]>(() => (kind.value === 'category' ? report.value.categories : report.value.merchants))
watch([choices, kind], () => {
  if (!choices.value.some(c => c.id === which.value)) which.value = choices.value[0]?.id ?? ''
}, { immediate: true })
const series = computed(() => choices.value.find(c => c.id === which.value))
const seriesTop = computed(() => niceCeiling(Math.max(0, ...(series.value?.months ?? []))))
const seriesAvg = computed(() => (series.value ? Math.round(series.value.total_cents / Math.max(1, series.value.months.length)) : 0))
const seriesBest = computed(() => {
  const s = series.value
  if (!s) return null
  const i = s.months.reduce((b, v, j) => (v > (s.months[b] ?? 0) ? j : b), 0)
  return { month: report.value.months[i]?.month ?? '', cents: s.months[i] ?? 0 }
})

// Where the income went: income (and, when spending was more, savings) on
// the left, flowing into each spending category and what was kept on the right.
const W = 400
const H = 240
const GAP = 6
const NODE = 10
const COLORS = ['var(--flow-1)', 'var(--flow-2)', 'var(--flow-3)', 'var(--flow-4)', 'var(--flow-5)']
interface Node { label: string, cents: number, color: string, y: number, h: number }
const flowChart = computed(() => {
  const f = report.value.flow
  const targets = f.to.map((c, i) => ({ label: c.label, cents: c.cents, color: c.id === 'rest' ? 'var(--flow-rest)' : COLORS[i % COLORS.length]! }))
  if (f.saved_cents) targets.push({ label: 'Kept', cents: f.saved_cents, color: 'var(--gain)' })
  const sources = [{ label: 'Income', cents: f.income_cents, color: 'var(--gain)' }]
  if (f.short_cents) sources.push({ label: 'More than came in', cents: f.short_cents, color: 'var(--loss)' })
  const total = targets.reduce((n, t) => n + t.cents, 0)
  if (!total) return null
  const stack = (list: typeof targets): Node[] => {
    const k = (H - GAP * Math.max(0, list.length - 1)) / total
    let y = 0
    return list.map((t) => {
      const node = { ...t, y, h: Math.max(1, t.cents * k) }
      y += node.h + GAP
      return node
    })
  }
  const left = stack(sources.filter(s => s.cents))
  const right = stack(targets)
  // Walk both columns together, one band per stretch they share.
  const bands: { d: string, color: string, label: string, cents: number }[] = []
  let i = 0
  let j = 0
  let usedL = 0
  let usedR = 0
  while (i < left.length && j < right.length) {
    const l = left[i]!
    const r = right[j]!
    const cents = Math.min(l.cents - usedL, r.cents - usedR)
    const kl = l.h / l.cents
    const kr = r.h / r.cents
    const y0 = l.y + usedL * kl
    const y1 = y0 + cents * kl
    const z0 = r.y + usedR * kr
    const z1 = z0 + cents * kr
    const a = NODE
    const b = W - NODE
    const m = W / 2
    bands.push({ d: `M${a},${y0}C${m},${y0} ${m},${z0} ${b},${z0}L${b},${z1}C${m},${z1} ${m},${y1} ${a},${y1}Z`, color: r.color, label: `${l.label} to ${r.label}`, cents })
    usedL += cents
    usedR += cents
    if (usedL >= l.cents) { i++; usedL = 0 }
    if (usedR >= r.cents) { j++; usedR = 0 }
  }
  return { left, right, bands, total }
})
const flowLabel = computed(() => {
  const c = flowChart.value
  if (!c) return ''
  return `Where the money went, ${span.value}: ${formatCents(report.value.flow.income_cents)} came in. ${c.right.map(r => `${r.label} ${formatCents(r.cents)}`).join(', ')}.`
})
const hovered = ref('')

// A year in review.
const thisYear = Number(today.slice(0, 4))
const years = Array.from({ length: 5 }, (_, i) => thisYear - i)
const year = ref(Number(today.slice(5, 7)) <= 2 ? thisYear - 1 : thisYear)
const { data: review } = await useFetch<YearReview>('/api/reports/year', { query: { year }, lazy: true, server: false })
const change = (now: number, was: number) => {
  if (!was || !review.value) return ''
  const p = Math.round(((now - was) / Math.abs(was)) * 100)
  const before = review.value.partial ? 'the same months last year' : 'the year before'
  return p === 0 ? `the same as ${before}` : `${Math.abs(p)}% ${p > 0 ? 'more' : 'less'} than ${before}`
}
</script>

<template>
  <div>
    <AppHeader title="Reports" sub="Trends across months: what came in, what went out, and where it went." />

    <section class="group toolbar" aria-label="Which months">
      <div class="bar-row">
        <label class="range-pick">
          <span class="visually-hidden">Months</span>
          <select class="select" :value="preset || 'pick'" @change="(e) => { const v = (e.target as HTMLSelectElement).value; if (v === 'pick') customOpen = true; else pick(v as RangeId) }">
            <option v-for="r in RANGES" :key="r.id" :value="r.id">{{ r.label }}</option>
            <option value="pick">Pick months…</option>
          </select>
        </label>
        <div class="segmented range-segs" role="group" aria-label="Months">
          <button v-for="r in RANGES" :key="r.id" class="seg" :aria-pressed="preset === r.id" @click="pick(r.id)">{{ r.label }}</button>
          <button class="seg" :aria-pressed="!preset" @click="customOpen = true">Pick</button>
        </div>
        <span class="headline when" aria-live="polite">{{ span }}</span>
      </div>
      <form v-if="customOpen || !preset" class="bar-row range" @submit.prevent="showCustom">
        <label><span class="footnote">From</span> <input v-model="custom.from" class="input num" type="month" required></label>
        <label><span class="footnote">to</span> <input v-model="custom.to" class="input num" type="month" required></label>
        <button class="btn btn-tinted">Show</button>
      </form>
      <p v-if="rangeProblem" class="notice notice-error" role="alert">{{ rangeProblem }}</p>
    </section>

    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <div v-else-if="!hasAny && !pending" class="card card-pad stack group">
      <p class="headline">Nothing to show for {{ span }}</p>
      <p class="muted">Reports read the transactions in your accounts. Link a bank or import statements in Settings, or pick other months.</p>
      <NuxtLink to="/settings#accounts" class="btn btn-tinted">Go to your accounts</NuxtLink>
    </div>

    <template v-else>
      <!-- Income against spending, month by month. -->
      <section class="card group" aria-labelledby="inout-title" :aria-busy="pending">
        <div class="panel-head">
          <h2 id="inout-title" class="panel-title">Income and spending by month</h2>
        </div>
        <div class="card-pad">
          <dl class="figures">
            <div><dt>Income</dt><dd class="num gain">{{ formatCents(report.income_cents) }}</dd></div>
            <div><dt>Spending</dt><dd class="num loss">{{ formatCents(report.spent_cents) }}</dd></div>
            <div><dt>{{ kept >= 0 ? 'Kept' : 'Over' }}</dt><dd class="num" :class="moneyTone(kept)">{{ formatCents(Math.abs(kept)) }}</dd></div>
            <div><dt>Saved</dt><dd class="num">{{ report.saved_percent === null ? '—' : `${report.saved_percent}%` }}</dd></div>
          </dl>
          <div class="legend" aria-hidden="true">
            <span><i class="key income" /> Income</span>
            <span><i class="key spent" /> Spending</span>
          </div>
          <div class="chart" aria-hidden="true">
            <div class="axis"><span>{{ compact(top) }}</span><span>{{ compact(top / 2) }}</span><span>$0</span></div>
            <div class="plot">
              <div class="grid"><i /><i /><i /></div>
              <div v-for="(m, i) in report.months" :key="m.month" class="month" :title="`${monthName(m.month)}: income ${formatCents(m.income_cents)}, spending ${formatCents(m.spent_cents)}`">
                <span class="bars">
                  <span class="bar income" :style="{ height: height(m.income_cents, top) }" />
                  <span class="bar spent" :style="{ height: height(m.spent_cents, top) }" />
                </span>
                <span class="tick-label">{{ !many || i % 3 === 0 ? tick(m.month) : '' }}</span>
              </div>
            </div>
          </div>
          <details class="table-wrap">
            <summary class="link">Show the numbers</summary>
            <table class="numbers">
              <caption class="visually-hidden">Income and spending by month, {{ span }}</caption>
              <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th><th scope="col">Left</th></tr></thead>
              <tbody>
                <tr v-for="m in report.months" :key="m.month">
                  <th scope="row">{{ monthName(m.month) }}</th>
                  <td class="num">{{ formatCents(m.income_cents) }}</td>
                  <td class="num">{{ formatCents(m.spent_cents) }}</td>
                  <td class="num" :class="moneyTone(m.net_cents)">{{ formatCents(m.net_cents) }}</td>
                </tr>
              </tbody>
            </table>
          </details>
          <p class="caption">{{ formatCents(avgSpent) }} spent a month on average. Moving money between your own accounts counts as neither.</p>
        </div>
      </section>

      <div class="cols">
        <!-- One category or merchant over the months. -->
        <section class="card group" aria-labelledby="trend-title">
          <div class="panel-head">
            <h2 id="trend-title" class="panel-title">Over time</h2>
            <div class="segmented small" role="group" aria-label="Show a category or a merchant">
              <button class="seg" :aria-pressed="kind === 'category'" @click="kind = 'category'">Category</button>
              <button class="seg" :aria-pressed="kind === 'merchant'" @click="kind = 'merchant'">Merchant</button>
            </div>
          </div>
          <div v-if="choices.length" class="card-pad">
            <label class="visually-hidden" for="trend-pick">{{ kind === 'category' ? 'Category' : 'Merchant' }}</label>
            <select id="trend-pick" v-model="which" class="select">
              <option v-for="c in choices" :key="c.id" :value="c.id">{{ c.label }} · {{ formatCents(c.total_cents) }}</option>
            </select>
            <template v-if="series">
              <dl class="figures three">
                <div><dt>In all</dt><dd class="num loss">{{ formatCents(series.total_cents) }}</dd></div>
                <div><dt>A month</dt><dd class="num">{{ formatCents(seriesAvg) }}</dd></div>
                <div><dt>Most, {{ seriesBest ? monthName(seriesBest.month, true) : '' }}</dt><dd class="num">{{ formatCents(seriesBest?.cents ?? 0) }}</dd></div>
              </dl>
              <div class="chart short" aria-hidden="true">
                <div class="axis"><span>{{ compact(seriesTop) }}</span><span>{{ compact(seriesTop / 2) }}</span><span>$0</span></div>
                <div class="plot">
                  <div class="grid"><i /><i /><i /></div>
                  <span class="avg" :style="{ bottom: `calc(1.375rem + (100% - 1.375rem) * ${Math.min(1, seriesAvg / seriesTop)})` }" />
                  <div v-for="(v, i) in series.months" :key="i" class="month" :title="`${monthName(report.months[i]?.month ?? '')}: ${formatCents(v)}`">
                    <span class="bars"><span class="bar spent wide-bar" :style="{ height: height(v, seriesTop) }" /></span>
                    <span class="tick-label">{{ !many || i % 3 === 0 ? tick(report.months[i]?.month ?? '') : '' }}</span>
                  </div>
                </div>
              </div>
              <table class="visually-hidden">
                <caption>{{ series.label }} by month</caption>
                <tbody><tr v-for="(v, i) in series.months" :key="i"><th scope="row">{{ monthName(report.months[i]?.month ?? '') }}</th><td>{{ formatCents(v) }}</td></tr></tbody>
              </table>
              <p class="caption">The dashed line is the average month. {{ series.count.toLocaleString() }} {{ series.count === 1 ? 'transaction' : 'transactions' }}.</p>
            </template>
          </div>
          <p v-else class="card-pad footnote">No spending in {{ span }}.</p>
        </section>

        <!-- Where the income went. -->
        <section class="card group" aria-labelledby="flow-title">
          <div class="panel-head">
            <h2 id="flow-title" class="panel-title">Where the money went</h2>
          </div>
          <div v-if="flowChart" class="card-pad flow">
            <div class="flow-ends footnote" aria-hidden="true">
              <span>{{ report.flow.short_cents ? 'Income and more' : 'Income' }}</span><span>Spending and what was kept</span>
            </div>
            <svg class="sankey" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="flowLabel">
              <path
                v-for="b in flowChart.bands" :key="b.label" :d="b.d" class="band" :class="{ dim: hovered && hovered !== b.label.split(' to ')[1] }"
                :style="{ fill: b.color }"
              ><title>{{ b.label }}: {{ formatCents(b.cents) }}</title></path>
              <rect v-for="n in flowChart.left" :key="`l-${n.label}`" x="0" :y="n.y" :width="NODE" :height="n.h" rx="2" :style="{ fill: n.color }" />
              <rect v-for="n in flowChart.right" :key="`r-${n.label}`" :x="W - NODE" :y="n.y" :width="NODE" :height="n.h" rx="2" :style="{ fill: n.color }" />
            </svg>
            <ul class="flow-legend">
              <li v-for="n in flowChart.right" :key="n.label" :class="{ dim: hovered && hovered !== n.label }" @mouseenter="hovered = n.label" @mouseleave="hovered = ''">
                <i class="swatch" :style="{ background: n.color }" aria-hidden="true" />
                <span class="flow-name">{{ n.label }}</span>
                <span class="num">{{ formatCents(n.cents) }}</span>
                <span class="num share">{{ report.flow.income_cents ? `${Math.round((n.cents / report.flow.income_cents) * 100)}%` : '' }}</span>
              </li>
            </ul>
            <p class="caption">
              {{ formatCents(report.flow.income_cents) }} came in.
              <template v-if="report.flow.short_cents">Spending went {{ formatCents(report.flow.short_cents) }} past it, paid from savings or credit.</template>
              <template v-else-if="report.flow.saved_cents">{{ formatCents(report.flow.saved_cents) }} of it was kept.</template>
              Shares are of income.
            </p>
          </div>
          <p v-else class="card-pad footnote">No income or spending in {{ span }}.</p>
        </section>
      </div>
    </template>

    <!-- A year in review. -->
    <section class="card group" aria-labelledby="year-title">
      <div class="panel-head">
        <h2 id="year-title" class="panel-title">Year in review</h2>
        <label><span class="visually-hidden">Year</span>
          <select v-model.number="year" class="select year-pick">
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>
      </div>
      <div v-if="review && (review.income_cents || review.spent_cents)" class="card-pad">
        <p v-if="review.partial" class="footnote">{{ review.year }} so far.</p>
        <dl class="figures">
          <div>
            <dt>Came in</dt><dd class="num gain">{{ formatCents(review.income_cents) }}</dd>
            <dd v-if="review.before && change(review.income_cents, review.before.income_cents)" class="caption">{{ change(review.income_cents, review.before.income_cents) }}</dd>
          </div>
          <div>
            <dt>Spent</dt><dd class="num loss">{{ formatCents(review.spent_cents) }}</dd>
            <dd v-if="review.before && change(review.spent_cents, review.before.spent_cents)" class="caption">{{ change(review.spent_cents, review.before.spent_cents) }}</dd>
          </div>
          <div><dt>{{ review.saved_cents >= 0 ? 'Kept' : 'Over' }}</dt><dd class="num" :class="moneyTone(review.saved_cents)">{{ formatCents(Math.abs(review.saved_cents)) }}</dd><dd v-if="review.saved_percent !== null" class="caption">{{ review.saved_percent }}% of income</dd></div>
          <div><dt>A month</dt><dd class="num">{{ formatCents(review.monthly_cents) }}</dd><dd class="caption">spent on average</dd></div>
        </dl>
        <ul class="facts">
          <li v-if="review.top_categories.length">
            <span class="fact-label">Most spent on</span>
            <span>{{ review.top_categories.map(c => `${c.label} (${formatCents(c.total_cents)})`).join(', ') }}</span>
          </li>
          <li v-if="review.top_merchant">
            <span class="fact-label">Top merchant</span>
            <span>{{ review.top_merchant.name }}: {{ formatCents(review.top_merchant.total_cents) }} over {{ review.top_merchant.count }} {{ review.top_merchant.count === 1 ? 'visit' : 'visits' }}</span>
          </li>
          <li v-if="review.biggest_month">
            <span class="fact-label">Biggest month</span>
            <span>{{ monthName(review.biggest_month.month) }}, {{ formatCents(review.biggest_month.spent_cents) }} spent</span>
          </li>
          <li><span class="fact-label">Transactions</span><span>{{ review.count.toLocaleString() }}</span></li>
        </ul>
      </div>
      <p v-else-if="review" class="card-pad footnote">Nothing in {{ year }} yet.</p>
      <p v-else class="card-pad footnote">Loading…</p>
    </section>
  </div>
</template>

<style scoped>
.toolbar { display: grid; gap: 0.75rem; }
.bar-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.when { margin-left: auto; }
.range-pick { display: none; }
.range-pick .select { width: auto; background: var(--surface); border-color: var(--separator); }
@media (max-width: 640px) {
  .range-segs { display: none; }
  .range-pick { display: block; }
}
.range label { display: inline-flex; align-items: center; gap: 0.5rem; }
.range .input { width: auto; background: var(--surface); border-color: var(--separator); }
.segmented.small .seg { min-height: 2.25rem; padding: 0 0.75rem; font-size: 0.875rem; }

@media (min-width: 900px) {
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
}

.figures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin: 0 0 1rem; }
.figures.three { grid-template-columns: repeat(3, 1fr); margin-top: 1rem; }
.figures dt { font-size: 0.8125rem; color: var(--text-2); }
.figures dd { margin: 0; font-size: 1.125rem; font-weight: 600; }
.figures dd.caption { font-size: 0.75rem; font-weight: 400; color: var(--text-2); }
@media (max-width: 560px) { .figures { grid-template-columns: repeat(2, 1fr); } }

/* Money's colours, whatever the theme: income green, spending red. */
.chart, .legend { --income: var(--gain); --spent: var(--loss); }
.legend { display: flex; gap: 1rem; font-size: 0.8125rem; color: var(--text-2); }
.key { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: 3px; margin-right: 0.25rem; vertical-align: -0.05rem; }
.key.income { background: var(--income); }
.key.spent { background: var(--spent); }
.chart { display: flex; gap: 0.5rem; height: 13rem; margin-top: 0.75rem; }
.chart.short { height: 10rem; }
.axis { display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 1.375rem; font-size: 0.6875rem; color: var(--text-3); text-align: right; min-width: 2.5rem; }
.axis span { line-height: 0; }
.plot { position: relative; flex: 1; display: flex; min-width: 0; }
.grid { position: absolute; inset: 0 0 1.375rem; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.grid i { border-top: var(--border); }
.grid i:last-child { border-top-color: var(--text-3); }
.month { flex: 1; display: flex; flex-direction: column; min-width: 0; color: var(--text-3); }
.bars { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 2px; padding: 0 1px; }
.bar { width: min(0.625rem, 40%); border-radius: 3px 3px 0 0; }
.bar.wide-bar { width: min(1.25rem, 70%); }
.bar.income { background: var(--income); }
.bar.spent { background: var(--spent); }
.tick-label { height: 1.375rem; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; white-space: nowrap; overflow: visible; }
.avg { position: absolute; left: 0; right: 0; border-top: 1.5px dashed var(--text-2); pointer-events: none; z-index: 1; }

.table-wrap { margin-top: 0.75rem; }
.table-wrap summary { cursor: pointer; font-size: 0.875rem; min-height: 2.75rem; display: flex; align-items: center; }
.numbers { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.numbers th, .numbers td { padding: 0.375rem 0.5rem; text-align: right; border-top: var(--border); }
.numbers th:first-child { text-align: left; font-weight: 400; }
.numbers thead th { color: var(--text-2); font-weight: 500; border-top: 0; }

#trend-pick { width: 100%; }

/*
 * Categories in the flow: categorical hues, told apart from money's green
 * and red (which mean income kept and spending past it, not a category).
 */
.flow {
  --flow-1: light-dark(#2a78d6, #3987e5); --flow-2: light-dark(#eb6834, #d95926); --flow-3: light-dark(#6250d6, #9085e9);
  --flow-4: light-dark(#eda100, #c98500); --flow-5: light-dark(#e87ba4, #d55181); --flow-rest: var(--text-3);
}
.flow-ends { display: flex; justify-content: space-between; margin-bottom: 0.375rem; }
.sankey { display: block; width: 100%; height: 15rem; }
.band { opacity: 0.45; transition: opacity 0.15s; }
.band:hover { opacity: 0.7; }
.flow-legend { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
.flow-legend li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; transition: opacity 0.15s; }
.flow-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share { width: 2.75rem; text-align: right; color: var(--text-2); font-size: 0.8125rem; }
.swatch { width: 0.625rem; height: 0.625rem; border-radius: 3px; flex: none; }
.dim { opacity: 0.25; }

.year-pick { width: auto; min-height: 2.25rem; font-size: 0.875rem; }
.facts { list-style: none; margin: 0; padding: 0; border-top: var(--border); }
.facts li { display: flex; gap: 1rem; padding: 0.625rem 0; border-bottom: var(--border); font-size: 0.9375rem; }
.facts li:last-child { border-bottom: 0; }
.fact-label { flex: 0 0 9rem; color: var(--text-2); }
@media (max-width: 480px) { .facts li { flex-direction: column; gap: 0.125rem; } .fact-label { flex: none; font-size: 0.8125rem; } }
.caption { margin: 0.75rem 0 0; font-size: 0.8125rem; color: var(--text-2); }
.gain { color: var(--gain); }
.loss { color: var(--loss); }
</style>
