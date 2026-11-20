<script setup lang="ts">
import { formatCents, type Account } from '~~/shared/accounts'
import type { SpendingSummary } from '~~/shared/categories'
import type { Goal } from '~~/shared/goals'
import { GROWTH_PERIODS, groupOf, type GrowthPeriodId, type Overview } from '~~/shared/overview'

// Overview only reads what the accounts hold (set up in Settings): net worth
// from their balances, income and spending from their transactions, and the
// investment accounts' growth from the balances seen over time.

const { me } = useAuth()
// The month picked on the chart (below), this one until one is.
const selected = ref('')
const thisMonth = useToday().slice(0, 7)
const shownMonth = computed(() => selected.value || thisMonth)

// Every request the page makes starts at once (issue #114): awaited one by
// one, a first load waited for each in turn.
const [{ data: list }, { data: ov, error }, { data: goalList }, { data: spend }] = await Promise.all([
  useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) }),
  useFetch<Overview>('/api/overview'),
  // Savings goals (their own page, /goals): one line under the savings rate.
  useFetch<{ goals: Goal[] }>('/api/goals', { default: () => ({ goals: [] }) }),
  // The shown month's spending by category (the pie, below).
  useFetch<SpendingSummary>('/api/spending', {
    query: { period: 'month', at: shownMonth },
    default: () => ({ from: '', to: '', spent_cents: 0, income_cents: 0, previous_spent_cents: 0, categories: [] }),
  }),
])

const greeting = computed(() => (me.value?.name ? `Hi, ${me.value.name.split(' ')[0]}` : 'Overview'))

const day = (date: string, year = false) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))

// Net worth
const worth = computed(() => ov.value?.net_worth)
const hasBalances = computed(() => !!worth.value?.groups.length)

// The months on the chart (OverviewFlow), and the one it shows.
const months = computed(() => ov.value?.months ?? [])
const shown = computed(() => months.value.find(m => m.month === selected.value) ?? months.value.at(-1))

// Investment growth over the period the person picks.
const period = ref<GrowthPeriodId>('1y')
const invested = computed(() => ov.value?.net_worth.groups.find(g => g.id === 'investments')?.total_cents ?? null)
const grown = computed(() => ov.value?.growth.find(g => g.period === period.value))
const periodName = computed(() => GROWTH_PERIODS.find(p => p.id === period.value)?.name ?? '')
// Savings goals: one line under the savings rate.
const goals = computed(() => ({
  count: goalList.value.goals.length,
  saved: goalList.value.goals.reduce((n, g) => n + g.saved_cents, 0),
  target: goalList.value.goals.reduce((n, g) => n + g.target_cents, 0),
}))
const percent = (rate: number) => `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${Math.abs(rate * 100).toFixed(Math.abs(rate) < 0.1 ? 2 : 1)}%`

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
const todayLabel = computed(() => new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }))
</script>

<template>
  <div>
    <AppHeader :title="greeting" :sub="todayLabel" />

    <!-- Set-up steps left, out-of-date balances, categories over budget. -->
    <OverviewSetup :accounts="list.accounts" :over-budget="ov?.over_budget ?? []" />

    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <div class="dash">
      <!-- Three cards of one height: net worth, investments, savings rate. Under them the 12-month bars, with the month's categories to their right. -->
      <section class="card side worth-area" aria-labelledby="worth-title">
        <div class="panel-head">
          <h2 id="worth-title" class="panel-title">Net worth</h2>
          <NuxtLink to="/settings#accounts" class="panel-link">Your accounts</NuxtLink>
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
            Left out until it has a balance: {{ worth.missing.map(m => m.name).join(', ') }}. Enter it in <NuxtLink to="/settings#accounts">Settings</NuxtLink>.
          </p>
        </template>
        <div v-else class="worth">
          <p class="num worth-value muted">—</p>
          <p v-if="!list.accounts.length" class="footnote">Connect your accounts in <NuxtLink to="/settings#accounts">Settings</NuxtLink>, and their balances add up to your net worth here.</p>
          <p v-else class="footnote">None of your accounts has a balance yet. Link them to their bank, or enter what each holds, in <NuxtLink to="/settings#accounts">Settings</NuxtLink>.</p>
        </div>
      </section>

      <!-- Two figures side by side. -->
      <div class="tiles tiles-area">
        <section class="card tile growth-area" aria-labelledby="growth-title">
          <div class="tile-head">
            <h2 id="growth-title" class="tile-label"><NuxtLink to="/investments" class="tile-link">Investments</NuxtLink></h2>
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
            <template v-else>
              <!-- A new link has today's value and nothing to compare it with yet: show what's invested. -->
              <p v-if="invested !== null" class="num tile-value" data-test="invested">{{ formatCents(invested) }}</p>
              <p class="footnote">Invested today. Growth shows once Cheddar has seen these balances on more than one day.</p>
            </template>
          </template>
          <p v-else class="footnote">Add a brokerage or retirement account in <NuxtLink to="/settings#accounts">Settings</NuxtLink> to see how your investments grow.</p>
        </section>

        <section class="card tile kept-area" aria-labelledby="kept-title">
          <div class="tile-head">
            <h2 id="kept-title" class="tile-label">Savings rate</h2>
            <NuxtLink to="/projections" class="panel-link">Projections</NuxtLink>
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
          <NuxtLink to="/goals" class="goals-line" data-test="goals-summary">
            <template v-if="goals.count">
              <span>{{ goals.count === 1 ? '1 goal' : `${goals.count} goals` }}</span>
              <span class="num" :title="`${formatCents(goals.saved)} of ${formatCents(goals.target)}`">{{ Math.floor(goals.saved / goals.target * 100) }}% saved</span>
            </template>
            <span v-else>Set a savings goal</span>
            <AppIcon name="chevron" />
          </NuxtLink>
        </section>
      </div>

      <OverviewFlow v-model:month="selected" class="chart-area" :months="months" />

      <OverviewCategories class="pie-area" :spending="spend" :month="shown?.month ?? ''" />
    </div>

    <!-- Whether linked banks are current, last on the page (G's choice): quiet when they are. -->
    <BankHealth class="health-last" />
  </div>
</template>

<style scoped>
.change { font-weight: 600; }

/*
 * The dashboard: net worth with the two figures beside it, then the
 * 12-month bars right under net worth and the month's categories beside
 * them. One column on a phone, in that order.
 */
.dash { display: grid; gap: 1.5rem; align-items: start; }
.dash > * { min-width: 0; }
.health-last { margin: 1.5rem 0 0; }
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
/* The goals line sits at the foot of the savings-rate tile. */
.goals-line {
  display: flex; align-items: center; gap: 0.5rem; margin-top: auto; padding-top: 0.75rem;
  border-top: 1px solid var(--separator); color: var(--text-2); font-size: 0.875rem;
}
.goals-line:hover { text-decoration: none; color: var(--text); }
.goals-line > span { white-space: nowrap; }
.goals-line .num { margin-left: auto; }
.goals-line :deep(.icon) { width: 1rem; height: 1rem; color: var(--text-3); }
.goals-line > span:only-of-type { margin-right: auto; }
.tile-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.75rem; }
.tile-label { margin: 0; font-size: 1rem; font-weight: 600; }
.tile-link { color: inherit; }
.tile-value { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
.tile-pick { width: auto; min-height: 1.75rem; padding: 0.125rem 0.5rem; font-size: 0.8125rem; }
.meter { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; margin: 0.125rem 0; }
.meter i { display: block; height: 100%; border-radius: 3px; background: var(--gain); }

@media (max-width: 560px) {
  .tiles { gap: 0.75rem; }
  .tile { padding: 0.875rem 1rem 1rem; }
  .tile-value { font-size: 1.5rem; }
  .tile-head { flex-wrap: wrap; }
  .tile-head .panel-link { display: none; }
}
</style>
