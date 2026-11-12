<script setup lang="ts">
import { formatCents, type Account } from '~~/shared/accounts'
import { GROWTH_PERIODS, type GrowthPeriodId, type Overview } from '~~/shared/overview'
import { stateByCode } from '~~/shared/states'

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
const percent = (rate: number) => `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${Math.abs(rate * 100).toFixed(Math.abs(rate) < 0.1 ? 2 : 1)}%`
</script>

<template>
  <div>
    <AppHeader :title="greeting" />

    <section v-if="left" class="group" aria-labelledby="setup">
      <h2 id="setup" class="group-title">Set up · {{ left }} left</h2>
      <div class="card">
        <NuxtLink v-for="s in steps" :key="s.label" :to="s.to" class="row step">
          <span class="tick" :class="{ on: s.done }" aria-hidden="true"><AppIcon v-if="s.done" name="check" /></span>
          <span class="row-label">
            <span class="step-label">{{ s.label }}</span><span class="visually-hidden">{{ s.done ? ', done' : '' }}</span>
            <span class="footnote">{{ s.hint }}</span>
          </span>
          <AppIcon name="chevron" class="chev" />
        </NuxtLink>
      </div>
    </section>

    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <section class="group" aria-labelledby="worth-title">
      <h2 id="worth-title" class="group-title">Net worth</h2>
      <div v-if="worth && hasBalances" class="card">
        <div class="card-pad hero">
          <p class="num large-title" :class="moneyTone(worth.total_cents)" data-test="net-worth">{{ formatCents(worth.total_cents) }}</p>
          <p v-if="ov?.change" class="footnote">
            <span class="num change" :class="moneyTone(ov.change.change_cents)">{{ signed(ov.change.change_cents) }}</span>
            since {{ day(ov.change.since) }}
          </p>
          <p v-else class="footnote">As of {{ day(worth.as_of, true) }}</p>
        </div>
        <div v-for="g in worth.groups" :key="g.id" class="row">
          <span class="row-label">
            <span class="block">{{ g.label }}</span>
            <span class="footnote">{{ g.count }} {{ g.count === 1 ? 'account' : 'accounts' }}</span>
          </span>
          <span class="num" :class="moneyTone(g.total_cents)">{{ formatCents(g.total_cents) }}</span>
        </div>
      </div>
      <div v-else class="card card-pad stack">
        <p class="num large-title muted">—</p>
        <p v-if="!list.accounts.length" class="footnote">Connect your accounts on <NuxtLink to="/accounts">Accounts</NuxtLink>, and their balances add up to your net worth here.</p>
        <p v-else class="footnote">None of your accounts has a balance yet. Link them to their bank, or enter what each holds, on <NuxtLink to="/accounts">Accounts</NuxtLink>.</p>
      </div>
      <p v-if="worth?.missing.length && hasBalances" class="group-footer">
        Left out until it has a balance: {{ worth.missing.map(m => m.name).join(', ') }}. Enter it on <NuxtLink to="/accounts">Accounts</NuxtLink>.
      </p>
    </section>

    <section class="group" aria-labelledby="flow-title">
      <h2 id="flow-title" class="group-title">Income and spending</h2>
      <div v-if="hasMonths" class="card card-pad">
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
              v-for="m in months" :key="m.month" class="month" :class="{ on: shown?.month === m.month }" tabindex="-1"
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
        <label class="visually-hidden" for="month-pick">Month</label>
        <div v-if="shown" class="detail" aria-live="polite">
          <select id="month-pick" class="select month-pick" :value="shown.month" @change="selected = ($event.target as HTMLSelectElement).value">
            <option v-for="m in months" :key="m.month" :value="m.month">{{ monthName(m.month) }}</option>
          </select>
          <dl class="figures">
            <div><dt>Income</dt><dd class="num" :class="moneyTone(shown.income_cents)">{{ formatCents(shown.income_cents) }}</dd></div>
            <div><dt>Spending</dt><dd class="num" :class="spendTone(shown.spent_cents)">{{ formatCents(shown.spent_cents) }}</dd></div>
            <div>
              <dt>{{ shown.income_cents >= shown.spent_cents ? 'Kept' : 'Over' }}</dt>
              <dd class="num" :class="moneyTone(shown.income_cents - shown.spent_cents)">{{ formatCents(Math.abs(shown.income_cents - shown.spent_cents)) }}</dd>
            </div>
          </dl>
          <NuxtLink :to="{ path: '/spending', query: { at: shown.month } }" class="footnote">See {{ monthName(shown.month).split(' ')[0] }}'s spending by category</NuxtLink>
        </div>
        <div class="visually-hidden">
          <table>
            <caption>Income and spending by month</caption>
            <thead><tr><th>Month</th><th>Income</th><th>Spending</th></tr></thead>
            <tbody>
              <tr v-for="m in months" :key="m.month"><td>{{ monthName(m.month) }}</td><td>{{ formatCents(m.income_cents) }}</td><td>{{ formatCents(m.spent_cents) }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="card card-pad">
        <p class="footnote">Each month's income and spending shows here once your accounts have transactions from the last year.</p>
      </div>
      <p class="group-footer">Moving money between your own accounts counts as neither.</p>
    </section>

    <section class="group" aria-labelledby="growth-title">
      <h2 id="growth-title" class="group-title">Investment growth</h2>
      <div class="card">
        <template v-if="ov?.has_investments">
          <div class="row">
            <div class="segmented" role="group" aria-label="Over">
              <button v-for="p in GROWTH_PERIODS" :key="p.id" class="seg" :aria-pressed="period === p.id" :aria-label="p.name" @click="period = p.id">{{ p.label }}</button>
            </div>
          </div>
          <div v-if="grown && grown.rate !== null" class="card-pad hero">
            <p class="num large-title" :class="moneyTone(grown.gain_cents)" data-test="growth">{{ percent(grown.rate) }}</p>
            <p class="footnote">
              <span class="num change" :class="moneyTone(grown.gain_cents)">{{ signed(grown.gain_cents) }}</span>
              since {{ day(grown.since, true) }}, on {{ formatCents(grown.start_cents) }}
            </p>
            <p v-if="grown.added_cents" class="footnote">
              Not counting the {{ formatCents(Math.abs(grown.added_cents)) }} you moved {{ grown.added_cents > 0 ? 'in' : 'out' }}.
            </p>
          </div>
          <div v-else class="card-pad">
            <p class="footnote">Growth shows once Cheddar has seen your investment accounts' balances on more than one day. Linked accounts update daily on their own; for the others, bring their balance up to date on <NuxtLink to="/accounts">Accounts</NuxtLink> now and then.</p>
          </div>
        </template>
        <div v-else class="card-pad">
          <p class="footnote">Add a brokerage or retirement account on <NuxtLink to="/accounts">Accounts</NuxtLink> to see how your investments grow.</p>
        </div>
      </div>
      <p class="group-footer">
        The change in your brokerage and retirement balances, less money you moved in. Dividends and interest count as growth.
      </p>
      <p v-if="me?.state" class="group-footer">Tax rules: federal and {{ stateByCode(me.state)?.name }}.</p>
    </section>
  </div>
</template>

<style scoped>
.step { color: var(--text); }
.step:hover { text-decoration: none; background: var(--surface-2); }
.step-label { display: block; }
.tick {
  flex: none; display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%;
  border: 1.5px solid var(--separator);
}
.tick.on { background: var(--success); border-color: var(--success); color: var(--surface); }
.tick :deep(.icon) { width: 1rem; height: 1rem; }
.chev { color: var(--text-3); width: 1rem; height: 1rem; }

.hero { border-bottom: 0.5px solid var(--separator); }
.hero .large-title { margin: 0 0 0.25rem; }
.change { font-weight: 600; }

/* The chart's two series are money's colours, whatever the theme: income green, spending red. */
.chart, .legend { --income: var(--gain); --spent: var(--loss); }
.legend { display: flex; gap: 1rem; font-size: 0.8125rem; color: var(--text-2); margin-bottom: 0.75rem; }
.key { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: 3px; margin-right: 0.25rem; vertical-align: -0.05rem; }
.key.income { background: var(--income); }
.key.spent { background: var(--spent); }
.chart { display: flex; gap: 0.5rem; height: 11rem; }
.axis {
  display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 1.375rem;
  font-size: 0.6875rem; color: var(--text-3); text-align: right; font-variant-numeric: tabular-nums;
}
.axis span { line-height: 0; }
.plot { position: relative; flex: 1; display: flex; min-width: 0; }
.grid { position: absolute; inset: 0 0 1.375rem; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.grid i { border-top: 0.5px solid var(--separator); }
.grid i:last-child { border-top-color: var(--text-3); }
.month {
  position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: stretch;
  border: 0; background: none; padding: 0; font: inherit; cursor: pointer; color: var(--text-3);
}
.month.on { color: var(--text); }
.month.on .bars { background: var(--surface-2); }
.bars { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 2px; border-radius: 4px 4px 0 0; padding: 0 2px; }
.bar { width: min(0.625rem, 40%); border-radius: 4px 4px 0 0; min-height: 0; }
.bar.income { background: var(--income); }
.bar.spent { background: var(--spent); }
.tick-label { height: 1.375rem; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; }
.month.on .tick-label { font-weight: 600; }
.detail { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 0.5px solid var(--separator); }
.month-pick { width: auto; font-weight: 600; }
.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0.75rem 0; }
.figures dt { font-size: 0.8125rem; color: var(--text-2); }
.figures dd { margin: 0; font-size: 1.0625rem; font-weight: 600; }

@media (max-width: 560px) {
  .wide { display: none; }
}
</style>
