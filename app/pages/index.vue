<script setup lang="ts">
import { formatCents, isStale, type Account } from '~~/shared/accounts'
import type { SpendingSummary } from '~~/shared/categories'
import { GROWTH_PERIODS, groupOf, type GrowthPeriodId, type Overview } from '~~/shared/overview'

// Overview only reads what the accounts hold (set up on Accounts): net worth
// from their balances, income and spending from their transactions, and the
// investment accounts' growth from the balances seen over time.

const { me } = useAuth()
const { data: list } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const { data: ov, error } = await useFetch<Overview>('/api/overview')

const steps = computed(() => [
  { done: !!me.value?.verified, label: 'Confirm your email', hint: 'So you can reset your password if you forget it.', to: '/settings' },
  {
    done: !!(me.value?.state && me.value?.filing_status),
    label: 'Choose your state and filing status',
    hint: 'Tax ideas use your own state\'s rules.',
    to: '/settings',
  },
  {
    done: list.value.accounts.length > 0,
    label: 'Connect your accounts',
    hint: 'Link your banks and cards, or import their statements. Everything here is worked out from them.',
    to: '/accounts',
  },
])
const left = computed(() => steps.value.filter(s => !s.done).length)
const greeting = computed(() => (me.value?.name ? `Hi, ${me.value.name.split(' ')[0]}` : 'Overview'))

const day = (date: string, year = false) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))

// Net worth
const worth = computed(() => ov.value?.net_worth)
const hasBalances = computed(() => !!worth.value?.groups.length)

// Income and spending, month by month: two bars a month on one scale.
const months = computed(() => ov.value?.months ?? [])
const hasMonths = computed(() => months.value.some(m => m.income_cents || m.spent_cents))
function niceCeiling(cents: number) {
  if (cents <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(cents))
  return ([1, 2, 2.5, 5, 10].find(s => s * p >= cents) ?? 10) * p
}
const top = computed(() => niceCeiling(Math.max(...months.value.map(m => Math.max(m.income_cents, m.spent_cents)), 0)))
const height = (cents: number) => `${Math.max(0, Math.min(100, (cents / top.value) * 100))}%`
const compact = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
const selected = ref('')
const shown = computed(() => months.value.find(m => m.month === selected.value) ?? months.value.at(-1))
const monthName = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// Investment growth over the period the person picks.
const period = ref<GrowthPeriodId>('1y')
const grown = computed(() => ov.value?.growth.find(g => g.period === period.value))
const periodName = computed(() => GROWTH_PERIODS.find(p => p.id === period.value)?.name ?? '')
const percent = (rate: number) => `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${Math.abs(rate * 100).toFixed(Math.abs(rate) < 0.1 ? 2 : 1)}%`

// The shown month's spending by category: the five largest, the rest as "Other".
const { data: spend } = await useFetch<SpendingSummary>('/api/spending', {
  query: { period: 'month', at: computed(() => shown.value?.month) },
  default: () => ({ from: '', to: '', spent_cents: 0, income_cents: 0, previous_spent_cents: 0, categories: [] }),
})
const SLICES = 5
const slices = computed(() => {
  const spent = spend.value.categories.filter(c => c.spending && c.total_cents > 0)
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

// How much of what came in was kept, over the last six whole months.
const kept = computed(() => {
  const six = months.value.slice(-7, -1)
  const income = six.reduce((n, m) => n + m.income_cents, 0)
  const spent = six.reduce((n, m) => n + m.spent_cents, 0)
  if (six.length < 6 || income <= 0) return null
  return { rate: (income - spent) / income, cents: income - spent, per_month: Math.round((income - spent) / 6) }
})

// The accounts panel: each kind's total (as net worth counts it), with the
// open accounts that make it up beneath. Closed and left-out ones count for
// nothing, so they aren't listed.
const today = useToday()
const byGroup = computed(() => {
  const open = list.value.accounts.filter(a => !a.excluded && !(a.closed_on && a.closed_on <= today) && a.balance_cents !== null)
  return (worth.value?.groups ?? []).map(g => ({
    ...g,
    accounts: open.filter(a => groupOf(a.kind) === g.id).sort((a, b) => Math.abs(b.balance_cents!) - Math.abs(a.balance_cents!)),
  }))
})
// Typed-in balances past their age (shared/accounts.ts): net worth includes them.
const stale = computed(() => list.value.accounts.filter(a => isStale(a, today)))
const todayLabel = computed(() => new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }))
</script>

<template>
  <div>
    <AppHeader :title="greeting" :sub="todayLabel" />

    <!-- Getting started: only what's left, on one slim card. -->
    <section v-if="left" class="group" aria-labelledby="setup">
      <div class="card">
        <div class="panel-head">
          <h2 id="setup" class="panel-title">Set up · {{ left }} left</h2>
          <div class="progress" aria-hidden="true"><i :style="{ width: `${((steps.length - left) / steps.length) * 100}%` }" /></div>
        </div>
        <NuxtLink v-for="s in steps.filter(x => !x.done)" :key="s.label" :to="s.to" class="row step">
          <span class="tick" aria-hidden="true" />
          <span class="row-label">
            <span class="step-label">{{ s.label }}</span>
            <span class="footnote">{{ s.hint }}</span>
          </span>
          <AppIcon name="chevron" class="chev" />
        </NuxtLink>
      </div>
    </section>

    <!-- Worth a look: balances typed in long ago, and categories over this month's budget. -->
    <section v-if="stale.length" class="group" aria-label="Out-of-date balances">
      <div class="card">
        <NuxtLink to="/accounts" class="row step">
          <span class="row-label">
            <span class="step-label">{{ stale.length === 1 ? '1 balance is out of date' : `${stale.length} balances are out of date` }}</span>
            <span class="footnote">{{ stale.map(a => a.name).join(', ') }}: net worth, growth and Projections use {{ stale.length === 1 ? 'it' : 'them' }}. Bring {{ stale.length === 1 ? 'it' : 'them' }} up to date on Accounts.</span>
          </span>
          <AppIcon name="chevron" class="chev" />
        </NuxtLink>
      </div>
    </section>

    <!-- Categories over this month's budget. -->
    <section v-if="ov?.over_budget.length" class="group" aria-labelledby="budget-title">
      <div class="card">
        <div class="panel-head">
          <h2 id="budget-title" class="panel-title">Over budget this month</h2>
        </div>
        <NuxtLink v-for="b in ov.over_budget" :key="b.id" :to="{ path: '/spending', query: { category: b.id } }" class="row step">
          <span class="row-label">
            <span class="step-label">{{ b.label }}</span>
            <span class="footnote"><span class="loss">{{ formatCents(b.spent_cents - b.budget_cents) }} over</span> · {{ formatCents(b.spent_cents) }} of {{ formatCents(b.budget_cents) }}</span>
          </span>
          <AppIcon name="chevron" class="chev" />
        </NuxtLink>
      </div>
    </section>

    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <div class="dash">
      <!-- Three cards of one height: net worth, investments, savings rate. Under them the 12-month bars, with the month's categories to their right. -->
      <section class="card side worth-area" aria-labelledby="worth-title">
        <div class="panel-head">
          <h2 id="worth-title" class="panel-title">Net worth</h2>
          <NuxtLink to="/accounts" class="panel-link">Accounts</NuxtLink>
        </div>
        <template v-if="worth && hasBalances">
          <div class="worth">
            <p class="num worth-value" :class="moneyTone(worth.total_cents)" data-test="net-worth">{{ formatCents(worth.total_cents) }}</p>
            <p v-if="ov?.change" class="footnote">
              <span class="num change" :class="moneyTone(ov.change.change_cents)">{{ signed(ov.change.change_cents) }}</span>
              since {{ day(ov.change.since) }}
            </p>
            <p v-else class="footnote">As of {{ day(worth.as_of, true) }}</p>
          </div>
          <!-- Each kind's total; open one to see the accounts in it. -->
          <details v-for="g in byGroup" :key="g.id" class="kind">
            <summary class="kind-head">
              <span>{{ g.label }}</span>
              <span class="num" :class="moneyTone(g.total_cents)">{{ formatCents(g.total_cents) }}</span>
            </summary>
            <ul class="kind-list">
              <li v-for="a in g.accounts" :key="a.id">
                <span class="acct-name">{{ a.name }}</span>
                <span class="num acct-bal">{{ formatCents(a.balance_cents!) }}</span>
              </li>
            </ul>
          </details>
          <p v-if="worth.missing.length" class="footnote side-note">
            Left out until it has a balance: {{ worth.missing.map(m => m.name).join(', ') }}. Enter it on <NuxtLink to="/accounts">Accounts</NuxtLink>.
          </p>
        </template>
        <div v-else class="worth">
          <p class="num worth-value muted">—</p>
          <p v-if="!list.accounts.length" class="footnote">Connect your accounts on <NuxtLink to="/accounts">Accounts</NuxtLink>, and their balances add up to your net worth here.</p>
          <p v-else class="footnote">None of your accounts has a balance yet. Link them to their bank, or enter what each holds, on <NuxtLink to="/accounts">Accounts</NuxtLink>.</p>
        </div>
      </section>

        <!-- Two figures side by side. -->
        <div class="tiles tiles-area">
          <section class="card tile growth-area" aria-labelledby="growth-title">
            <div class="tile-head">
              <h2 id="growth-title" class="tile-label">Investments</h2>
              <template v-if="ov?.has_investments">
                <label class="visually-hidden" for="growth-period">Over</label>
                <select id="growth-period" v-model="period" class="select tile-pick">
                  <option v-for="p in GROWTH_PERIODS" :key="p.id" :value="p.id">{{ p.label }}</option>
                </select>
              </template>
            </div>
            <template v-if="ov?.has_investments">
              <template v-if="grown && grown.rate !== null">
                <p class="num tile-value" :class="moneyTone(grown.gain_cents)" data-test="growth">{{ percent(grown.rate) }}</p>
                <p class="footnote">
                  <span class="num change" :class="moneyTone(grown.gain_cents)">{{ signed(grown.gain_cents) }}</span> over {{ periodName }}, less money moved in or out
                </p>
              </template>
              <p v-else class="footnote">Growth shows once Cheddar has seen your investment accounts' balances on more than one day. Bring the others up to date on <NuxtLink to="/accounts">Accounts</NuxtLink> now and then.</p>
            </template>
            <p v-else class="footnote">Add a brokerage or retirement account on <NuxtLink to="/accounts">Accounts</NuxtLink> to see how your investments grow.</p>
          </section>

          <section class="card tile kept-area" aria-labelledby="kept-title">
            <div class="tile-head">
              <h2 id="kept-title" class="tile-label">Savings rate</h2>
              <NuxtLink to="/projections" class="panel-link">Projections</NuxtLink>
              <NuxtLink to="/goals" class="panel-link">Goals</NuxtLink>
            </div>
            <template v-if="kept">
              <p class="num tile-value" :class="moneyTone(kept.cents)" data-test="kept">{{ Math.round(kept.rate * 100) }}%</p>
              <div class="meter" aria-hidden="true"><i :style="{ width: `${Math.max(0, Math.min(100, kept.rate * 100))}%` }" /></div>
              <p class="footnote">
                <span class="num change" :class="moneyTone(kept.per_month)">{{ formatCents(Math.abs(kept.per_month)) }}</span>
                a month {{ kept.per_month >= 0 ? 'kept' : 'over' }}, last 6 months
              </p>
            </template>
            <p v-else class="footnote">Shows once your accounts have six whole months of income and spending.</p>
          </section>
        </div>

        <section class="card panel chart-area" aria-labelledby="flow-title">
          <div class="panel-head">
            <h2 id="flow-title" class="panel-title">Income and spending</h2>
            <template v-if="hasMonths && shown">
              <label class="visually-hidden" for="month-pick">Month</label>
              <select id="month-pick" class="select month-pick" :value="shown.month" @change="selected = ($event.target as HTMLSelectElement).value">
                <option v-for="m in months" :key="m.month" :value="m.month">{{ monthName(m.month) }}</option>
              </select>
            </template>
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
    </div>
  </div>
</template>

<style scoped>
/* Getting started */
.step { color: var(--text); }
.step:hover { text-decoration: none; background: var(--surface-2); }
.step-label { display: block; }
.tick { flex: none; width: 1.375rem; height: 1.375rem; border-radius: 50%; border: 1.5px solid var(--text-3); }
.chev { color: var(--text-3); width: 1rem; height: 1rem; }
.progress { width: 8rem; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.progress i { display: block; height: 100%; background: var(--accent); border-radius: 3px; }

.change { font-weight: 600; }

/*
 * The dashboard: net worth with the two figures beside it, then the
 * 12-month bars right under net worth and the month's categories beside
 * them. One column on a phone, in that order.
 */
.dash { display: grid; gap: 1.5rem; align-items: start; }
.dash > * { min-width: 0; }
@media (min-width: 900px) {
  .dash {
    grid-template-columns: repeat(3, 1fr);
    grid-template-areas: "worth growth kept" "chart chart pie";
    align-items: stretch;
  }
  .dash .tiles-area { display: contents; }
  .worth-area { grid-area: worth; }
  .growth-area { grid-area: growth; }
  .kept-area { grid-area: kept; }
  .chart-area { grid-area: chart; }
  .pie-area { grid-area: pie; }
  .pie-area .pie-wrap { flex-direction: column; }
  .pie-area .pie-legend { width: 100%; min-width: 0; }
}

.worth { padding: 1rem 1.25rem 0.75rem; }
.worth p { margin: 0; }
.worth-value { font-size: 2rem; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; margin-bottom: 0.25rem !important; }
.kind { border-top: var(--border); }
.kind-head {
  display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; min-height: 2.5rem;
  padding: 0.375rem 1.25rem; font-size: 0.9375rem; font-weight: 500; cursor: pointer; list-style: none;
}
.kind-head::-webkit-details-marker { display: none; }
.kind-head > span:first-child::before {
  content: ''; display: inline-block; width: 0.4rem; height: 0.4rem; margin: 0 0.5rem 0.1rem 0;
  border: solid var(--text-3); border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg); transition: transform 0.15s;
}
.kind[open] .kind-head > span:first-child::before { transform: rotate(45deg); }
.kind-head:hover { background: var(--surface-2); }
.kind-list { list-style: none; margin: 0; padding: 0 0 0.5rem; }
.kind-list li { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; padding: 0.25rem 1.25rem 0.25rem 2.15rem; font-size: 0.875rem; }
.acct-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.acct-bal { color: var(--text-2); }
.side-note { margin: 0; padding: 0.75rem 1.25rem 1rem; border-top: var(--border); }

/* Two figures */
.tiles { display: grid; gap: 1.5rem; grid-template-columns: 1fr 1fr; align-items: stretch; }
.tile { min-width: 0; padding: 1rem 1.25rem 1.25rem; display: grid; gap: 0.375rem; align-content: start; }
.tile > p { margin: 0; }
.tile-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.75rem; }
.tile-label { margin: 0; font-size: 1rem; font-weight: 600; }
.tile-value { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
.tile-pick { width: auto; min-height: 1.75rem; padding: 0.125rem 0.5rem; font-size: 0.8125rem; }
.meter { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; margin: 0.125rem 0; }
.meter i { display: block; height: 100%; border-radius: 3px; background: var(--gain); }

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
.month-pick { width: auto; min-height: 2.25rem; font-size: 0.875rem; }
.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 1rem 0 0.75rem; padding-top: 1rem; border-top: var(--border); }
.figures dt { font-size: 0.8125rem; color: var(--text-2); }
.figures dd { margin: 0; font-size: 1.125rem; font-weight: 600; }
.caption { margin: 0; }

@media (max-width: 560px) {
  .wide { display: none; }
  .tiles { gap: 0.75rem; }
  .tile { padding: 0.875rem 1rem 1rem; }
  .tile-value { font-size: 1.5rem; }
  .tile-head { flex-wrap: wrap; }
  .tile-head .panel-link { display: none; }
  .progress { width: 4.5rem; }
}
</style>
