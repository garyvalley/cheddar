<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { MAX_PAYOFF_MONTHS, monthsAfter, payoff, project, WITHDRAWAL_RATE, type Debt, type Projections } from '~~/shared/projections'

// Projections only read what the accounts hold (set up on Accounts): the
// savings rate from the last whole months, today's investments, and how fast
// each card and loan is being paid down. The assumptions are the person's to
// change, and this browser remembers them.

const { me } = useAuth()
const { data: pj, error } = await useFetch<Projections>('/api/projections')
const today = useToday()

const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))
const percent = (rate: number) => `${rate < 0 ? '−' : ''}${Math.abs(rate * 100).toFixed(Math.abs(rate) < 0.1 ? 1 : 0)}%`
const whole = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
const compact = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
const monthName = (month: string, long = false) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
const span = (months: number) => {
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y && `${y} yr`, m && `${m} mo`].filter(Boolean).join(' ') || 'this month'
}

// Assumptions, kept in this browser for this person.
interface Saved { years: number, returnPct: number, monthly: string, debts: Record<string, { payment?: string, apr?: string }> }
const key = computed(() => `cheddar:projections:${me.value?.id ?? ''}`)
const saved = reactive<Saved>({ years: 25, returnPct: 5, monthly: '', debts: {} })
onMounted(() => {
  try {
    const raw = localStorage.getItem(key.value)
    if (raw) Object.assign(saved, JSON.parse(raw))
  }
  catch { /* nothing remembered */ }
})
watch(saved, () => {
  try { localStorage.setItem(key.value, JSON.stringify(saved)) }
  catch { /* not remembered, still works */ }
}, { deep: true })

/** A dollar amount typed in a box, as cents; null when it isn't one. */
function dollars(text: string | undefined): number | null {
  const t = (text ?? '').replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}
function rate(text: string | undefined): number | null {
  const t = (text ?? '').replace(/[%\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(t) || Number(t) > 100) return null
  return Number(t) / 100
}

// Savings rate
const sv = computed(() => pj.value?.savings)
const months = computed(() => pj.value?.months ?? [])
// Months kept rise above the zero line and months overspent hang below it, each half as tall as its biggest month.
const keptUp = computed(() => Math.max(0, ...months.value.map(m => m.income_cents - m.spent_cents)))
const keptDown = computed(() => Math.max(0, ...months.value.map(m => m.spent_cents - m.income_cents)))
const keptHeight = (m: { income_cents: number, spent_cents: number }) => {
  const k = m.income_cents - m.spent_cents
  return `${(Math.abs(k) / Math.max(1, k >= 0 ? keptUp.value : keptDown.value)) * 100}%`
}

// Where it takes you
const suggested = computed(() => Math.max(0, sv.value?.kept_cents ?? 0))
const monthly = computed(() => dollars(saved.monthly) ?? suggested.value)
const monthlyBad = computed(() => saved.monthly.trim() !== '' && dollars(saved.monthly) === null)
const years = computed(() => Math.min(60, Math.max(1, Math.round(Number(saved.years) || 0))))
const returnRate = computed(() => Math.min(15, Math.max(-5, Number(saved.returnPct) || 0)) / 100)
const points = computed(() => project(pj.value?.invested_cents ?? 0, { years: years.value, annual_return: returnRate.value, monthly_cents: monthly.value }))
const end = computed(() => points.value.at(-1)!)
const startYear = Number(today.slice(0, 4))

// The chart: what it's worth, over what was put in.
const W = 300
const H = 120
const peak = computed(() => Math.max(1, ...points.value.map(p => Math.max(p.balance_cents, p.put_in_cents))))
const xy = (i: number, cents: number) => `${(i / Math.max(1, points.value.length - 1)) * W},${H - (Math.max(0, cents) / peak.value) * H}`
const worthLine = computed(() => points.value.map((p, i) => xy(i, p.balance_cents)).join(' '))
const putLine = computed(() => points.value.map((p, i) => xy(i, p.put_in_cents)).join(' '))
const worthArea = computed(() => `0,${H} ${worthLine.value} ${W},${H}`)

// Debts
function debtPlan(d: Debt) {
  const mine = saved.debts[d.id] ?? {}
  const typed = dollars(mine.payment)
  const payment = typed ?? d.paydown_cents ?? 0
  const apr = rate(mine.apr) ?? 0
  const p = payoff(d.owed_cents, payment, apr)
  return { payment, apr, typed: typed !== null, plan: p, when: p ? monthsAfter(today, p.months) : '' }
}
const plans = computed(() => (pj.value?.debts ?? []).map(d => ({ d, ...debtPlan(d) })))
const debtFree = computed(() => {
  const all = plans.value
  if (!all.length || all.some(p => !p.plan)) return null
  return all.reduce((m, p) => (p.when > m ? p.when : m), '')
})
function setDebt(id: string, field: 'payment' | 'apr', value: string) {
  saved.debts[id] = { ...saved.debts[id], [field]: value }
}
</script>

<template>
  <div>
    <AppHeader title="Projections" />

    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <div class="cols">
      <div>
        <section class="group" aria-labelledby="rate-title">
          <h2 id="rate-title" class="group-title">Savings rate</h2>
          <div v-if="sv && sv.months_counted" class="card">
            <div class="card-pad hero">
              <p class="num large-title" :class="moneyTone(sv.kept_cents)" data-test="savings-rate">{{ sv.rate === null ? '—' : percent(sv.rate) }}</p>
              <p class="footnote">
                of your income kept, on average over the last {{ sv.months_counted === 1 ? 'month' : `${sv.months_counted} months` }}
              </p>
            </div>
            <div class="card-pad">
              <dl class="figures">
                <div><dt>Income</dt><dd class="num" :class="moneyTone(sv.income_cents)">{{ formatCents(sv.income_cents) }}</dd></div>
                <div><dt>Spending</dt><dd class="num" :class="spendTone(sv.spent_cents)">{{ formatCents(sv.spent_cents) }}</dd></div>
                <div>
                  <dt>{{ sv.kept_cents >= 0 ? 'Kept' : 'Over' }}</dt>
                  <dd class="num" :class="moneyTone(sv.kept_cents)">{{ formatCents(Math.abs(sv.kept_cents)) }}</dd>
                </div>
              </dl>
              <p class="footnote muted">A month, on average.</p>
              <div class="kept" aria-hidden="true">
                <div v-for="m in months" :key="m.month" class="kept-month" :title="`${monthName(m.month, true)}: ${signed(m.income_cents - m.spent_cents)}`">
                  <span v-if="keptUp" class="kept-half" :style="{ flexGrow: keptUp }"><span v-if="m.income_cents >= m.spent_cents" class="kept-bar up-bar" :style="{ height: keptHeight(m) }" /></span>
                  <span class="kept-zero" />
                  <span v-if="keptDown" class="kept-half down-half" :style="{ flexGrow: keptDown }"><span v-if="m.income_cents < m.spent_cents" class="kept-bar down-bar" :style="{ height: keptHeight(m) }" /></span>
                  <span class="kept-label">{{ m.label }}</span>
                </div>
              </div>
              <div class="visually-hidden">
                <table>
                  <caption>Kept or overspent by month</caption>
                  <thead><tr><th>Month</th><th>Income</th><th>Spending</th><th>Kept</th></tr></thead>
                  <tbody>
                    <tr v-for="m in months" :key="m.month">
                      <td>{{ monthName(m.month, true) }}</td><td>{{ formatCents(m.income_cents) }}</td><td>{{ formatCents(m.spent_cents) }}</td><td>{{ signed(m.income_cents - m.spent_cents) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div v-else class="card card-pad">
            <p class="footnote">Your savings rate shows here once your accounts have income or spending from the last {{ months.length || 6 }} whole months. Link or import them on <NuxtLink to="/accounts">Accounts</NuxtLink>.</p>
          </div>
          <p class="group-footer">From the last whole months; this month counts once it's over. Moving money between your own accounts counts as neither.</p>
        </section>
      </div>
      <div>
        <section class="group" aria-labelledby="debt-title">
          <h2 id="debt-title" class="group-title">Paying off debt</h2>
          <div v-if="plans.length" class="card">
            <div class="card-pad hero">
              <p v-if="debtFree" class="num large-title" data-test="debt-free">{{ monthName(debtFree, true) }}</p>
              <p v-else class="num large-title loss" data-test="debt-free">Not yet</p>
              <p class="footnote">
                <template v-if="debtFree">is when you're debt free at this pace, from {{ formatCents(plans.reduce((s, p) => s + p.d.owed_cents, 0)) }} owed today.</template>
                <template v-else>At this pace, not everything gets paid off. The debts below say which.</template>
              </p>
            </div>
            <div v-for="p in plans" :key="p.d.id" class="debt" :data-test="`debt-${p.d.name}`">
              <div class="row">
                <span class="row-label">
                  <span class="block">{{ p.d.name }}</span>
                  <span class="footnote">
                    <template v-if="p.payment > 0">Paying down {{ formatCents(p.payment) }} a month{{ p.typed ? ' (yours)' : '' }}</template>
                    <template v-else-if="p.d.paydown_cents !== null">Growing by {{ formatCents(-p.d.paydown_cents) }} a month lately</template>
                    <template v-else>No pace yet: enter what you pay</template>
                  </span>
                </span>
                <span class="row-value">
                  <span class="num block loss">{{ formatCents(-p.d.owed_cents) }}</span>
                  <span v-if="p.plan" class="footnote gain">Paid off {{ monthName(p.when) }}</span>
                  <span v-else class="footnote loss">{{ p.payment > 0 ? 'Doesn\'t outrun the interest' : 'Not shrinking' }}</span>
                </span>
              </div>
              <details class="debt-more">
                <summary>
                  <template v-if="p.plan">{{ span(p.plan.months) }}<template v-if="p.plan.interest_cents">, {{ formatCents(p.plan.interest_cents) }} in interest</template></template>
                  <template v-else>Change the payment or interest rate</template>
                </summary>
                <div class="debt-fields">
                  <label>
                    <span class="field-label">Monthly payment</span>
                    <input
                      class="input num" inputmode="decimal" :value="saved.debts[p.d.id]?.payment ?? ''"
                      :placeholder="p.d.paydown_cents && p.d.paydown_cents > 0 ? formatCents(p.d.paydown_cents) : '$0.00'"
                      @input="setDebt(p.d.id, 'payment', ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                  <label>
                    <span class="field-label">Interest rate (APR %)</span>
                    <input
                      class="input num" inputmode="decimal" placeholder="0" :value="saved.debts[p.d.id]?.apr ?? ''"
                      @input="setDebt(p.d.id, 'apr', ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                </div>
                <p class="footnote muted">
                  <template v-if="p.d.basis === 'transactions'">The pace is this account's payments less new charges, a month on average lately.</template>
                  <template v-else-if="p.d.basis === 'balances'">The pace is how fast its balance has come down since Cheddar first saw it.</template>
                  <template v-else>Cheddar hasn't seen this balance change yet. Bring it up to date on <NuxtLink to="/accounts">Accounts</NuxtLink> now and then, or enter the payment.</template>
                  With no rate entered, interest isn't counted; past {{ MAX_PAYOFF_MONTHS / 12 }} years counts as never.
                </p>
              </details>
            </div>
          </div>
          <div v-else class="card card-pad">
            <p class="footnote">No card or loan owes anything. Cards and loans you add on <NuxtLink to="/accounts">Accounts</NuxtLink> show when they'll be paid off here.</p>
          </div>
        </section>
      </div>
    </div>

    <section class="group" aria-labelledby="future-title">
      <h2 id="future-title" class="group-title">Where it takes you</h2>
      <div class="card">
        <div class="card-pad hero">
          <p class="num large-title" :class="moneyTone(end.balance_cents)" data-test="projected">{{ whole(end.balance_cents) }}</p>
          <p class="footnote">
            in your investments by {{ startYear + years }}, in today's dollars<template v-if="end.balance_cents > 0">.
              At {{ WITHDRAWAL_RATE * 100 }}% a year that's about <strong class="num">{{ whole(end.balance_cents * WITHDRAWAL_RATE / 12) }}</strong> a month.</template>
          </p>
        </div>
        <div class="card-pad">
          <div class="legend" aria-hidden="true">
            <span><i class="key worth" /> Worth</span>
            <span><i class="key put" /> Put in</span>
          </div>
          <div class="chart" aria-hidden="true">
            <div class="axis">
              <span>{{ compact(peak) }}</span>
              <span>{{ compact(peak / 2) }}</span>
              <span>$0</span>
            </div>
            <div class="plot">
              <div class="grid"><i /><i /><i /></div>
              <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="svg">
                <polygon :points="worthArea" class="worth-area" />
                <polyline :points="putLine" class="put-line" />
                <polyline :points="worthLine" class="worth-line" />
              </svg>
              <div class="years">
                <span>{{ startYear }}</span><span>{{ startYear + Math.round(years / 2) }}</span><span>{{ startYear + years }}</span>
              </div>
            </div>
          </div>
          <dl class="figures">
            <div><dt>Invested now</dt><dd class="num" :class="moneyTone(pj?.invested_cents ?? 0)">{{ whole(pj?.invested_cents ?? 0) }}</dd></div>
            <div><dt>Put in</dt><dd class="num" :class="moneyTone(end.put_in_cents)">{{ whole(end.put_in_cents) }}</dd></div>
            <div><dt>Growth</dt><dd class="num" :class="moneyTone(end.balance_cents - end.put_in_cents)">{{ whole(end.balance_cents - end.put_in_cents) }}</dd></div>
          </dl>
          <div class="visually-hidden">
            <table>
              <caption>Projected investments by year</caption>
              <thead><tr><th>Year</th><th>Worth</th><th>Put in</th></tr></thead>
              <tbody>
                <tr v-for="p in points" :key="p.year"><td>{{ startYear + p.year }}</td><td>{{ whole(p.balance_cents) }}</td><td>{{ whole(p.put_in_cents) }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <h3 class="group-title sub">Assumptions</h3>
      <div class="card assumptions">
        <label class="field">
          <span class="field-label">Added each month</span>
          <input
            v-model="saved.monthly" class="input num" inputmode="decimal" :placeholder="formatCents(suggested)"
            :aria-invalid="monthlyBad" aria-describedby="monthly-hint" data-test="monthly"
          >
          <span id="monthly-hint" class="footnote">
            <template v-if="monthlyBad">Enter an amount, like 500.</template>
            <template v-else-if="saved.monthly.trim()">Your own amount. <button class="link" type="button" @click="saved.monthly = ''">Use what you keep ({{ formatCents(suggested) }})</button></template>
            <template v-else>What you keep a month, on average.</template>
          </span>
        </label>
        <label class="field">
          <span class="field-label">Years from now</span>
          <input v-model.number="saved.years" class="input num" type="number" min="1" max="60" step="1" data-test="years">
        </label>
        <label class="field">
          <span class="field-label">Growth a year, after inflation (%)</span>
          <input v-model.number="saved.returnPct" class="input num" type="number" min="-5" max="15" step="0.5" data-test="return">
          <span class="footnote">Stocks have averaged roughly 5–7% a year after inflation over the long run; bonds and cash less. Not a promise.</span>
        </label>
      </div>
      <p class="group-footer">
        Starts from your brokerage and retirement balances<template v-if="!pj?.has_investments"> (none yet: add them on <NuxtLink to="/accounts">Accounts</NuxtLink>)</template>, before taxes and fees. This browser remembers your assumptions.
      </p>
    </section>
  </div>
</template>

<style scoped>
/* The three assumptions side by side on a wide screen. */
@media (min-width: 900px) {
  .assumptions { display: grid; grid-template-columns: repeat(3, 1fr); }
  .assumptions .field + .field { border-top: 0; border-left: var(--border); }
}
/* Two columns side by side on a wide screen, one after the other on a phone. */
@media (min-width: 900px) {
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; align-items: start; }
}

.hero { border-bottom: var(--border); }
.hero .large-title { margin: 0 0 0.25rem; }
.sub { margin-top: 1rem; }

.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0 0 0.25rem; }
.figures dt { font-size: 0.8125rem; color: var(--text-2); }
.figures dd { margin: 0; font-size: 1.0625rem; font-weight: 600; }

/* Each month kept (up, green) or overspent (down, red), around a zero line. */
.kept { display: flex; gap: 0.25rem; height: 5.5rem; margin-top: 0.75rem; }
.kept-month { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.kept-half { flex: 1 1 0; min-height: 0; display: flex; align-items: flex-end; justify-content: center; }
.down-half { align-items: flex-start; }
.kept-zero { border-top: 0.5px solid var(--text-3); }
.kept-bar { width: min(1.25rem, 60%); }
.up-bar { background: var(--gain); border-radius: 3px 3px 0 0; }
.down-bar { background: var(--loss); border-radius: 0 0 3px 3px; }
.kept-label { font-size: 0.6875rem; color: var(--text-3); text-align: center; margin-top: 0.25rem; }

/* The projection is money held, so it is the gain green in every theme: worth filled, what was put in a dashed line. */
.legend { display: flex; gap: 1rem; font-size: 0.8125rem; color: var(--text-2); margin-bottom: 0.75rem; }
.key { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: 3px; margin-right: 0.25rem; vertical-align: -0.05rem; }
.key.worth { background: var(--gain); }
.key.put { background: var(--text-3); }
.chart { display: flex; gap: 0.5rem; height: 11rem; margin-bottom: 1rem; }
.axis {
  display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 1.375rem;
  font-size: 0.6875rem; color: var(--text-3); text-align: right; font-variant-numeric: tabular-nums;
}
.axis span { line-height: 0; }
.plot { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; }
.grid { position: absolute; inset: 0 0 1.375rem; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.grid i { border-top: var(--border); }
.grid i:last-child { border-top-color: var(--text-3); }
.svg { position: relative; flex: 1; width: 100%; height: calc(100% - 1.375rem); overflow: visible; }
.worth-area { fill: color-mix(in oklab, var(--gain) 22%, transparent); }
.worth-line { fill: none; stroke: var(--gain); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.put-line { fill: none; stroke: var(--text-3); stroke-width: 1.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.years { height: 1.375rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.6875rem; color: var(--text-3); }

.link { border: 0; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
.link:hover { text-decoration: underline; }

.debt + .debt { border-top: var(--border); }
.debt .row-value { display: flex; flex-direction: column; align-items: flex-end; }
.debt-more { padding: 0 1rem 0.75rem; }
.debt-more summary { font-size: 0.8125rem; color: var(--accent); cursor: pointer; }
.debt-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin: 0.75rem 0 0.5rem; }
</style>
