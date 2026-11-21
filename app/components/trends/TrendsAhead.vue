<script setup lang="ts">
import { formatCents, type PaidInFull } from '~~/shared/accounts'
import { debtPlan, MAX_PAYOFF_MONTHS, project, STRATEGIES, strategyPlan, WITHDRAWAL_RATE, type Debt, type Projections } from '~~/shared/projections'

// Trends' look ahead (once the Projections page) only reads what the
// accounts hold (set up in Settings): the savings rate from the last whole
// months, today's investments, and how fast each card and loan is being paid
// down. The assumptions are the person's to
// change, and this browser remembers them.

const { data: pj, error, refresh } = await useFetch<Projections>('/api/projections')
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

// Assumptions, kept in this browser for this person (useProjectionAssumptions).
const { saved, setDebt } = useProjectionAssumptions()

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
const monthly = computed(() => parseDollars(saved.monthly) ?? suggested.value)
const monthlyBad = computed(() => saved.monthly.trim() !== '' && parseDollars(saved.monthly) === null)
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

// Debts: each estimate shows the payment and APR it rests on, and whose they are (shared/projections.ts debtPlan).
const plans = computed(() => (pj.value?.debts ?? []).map((d) => {
  const mine = saved.debts[d.id] ?? {}
  return { d, ...debtPlan(d, { payment_cents: parseDollars(mine.payment), apr: parsePercent(mine.apr) }, today) }
}))
// A card paid in full each month has nothing to pay off: it's listed on its own and counts in none of the dates.
const toPay = computed(() => plans.value.filter(p => p.status !== 'in_full'))
const inFull = computed(() => plans.value.filter(p => p.status === 'in_full'))
const dated = (p: { status: string }) => p.status === 'estimate' || p.status === 'paid'
const debtFree = computed(() => {
  const all = toPay.value
  if (!all.length || !all.every(dated)) return null
  return all.reduce((m, p) => (p.when > m ? p.when : m), '')
})
// Estimates that leave interest out, because no APR was entered.
const noRate = computed(() => plans.value.filter(p => p.status === 'estimate' && p.apr === null).map(p => p.d.name))
const names = (list: string[]) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`)
const aprText = (apr: number) => `${Number((apr * 100).toFixed(2))}%`
const dayName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
/** Where an inferred pace comes from, in words. */
function paceFrom(d: Debt) {
  if (d.basis === 'transactions') return `payments less new charges since ${monthName(d.pace_since.slice(0, 7))}, a month on average`
  if (d.basis === 'balances') return `how fast its balance has come down since ${dayName(d.pace_since)}`
  return ''
}
// Every debt together (issue #112): an extra amount a month to one debt at a time, avalanche against snowball.
const extra = computed(() => parseDollars(saved.extra) ?? 0)
const extraBad = computed(() => saved.extra.trim() !== '' && parseDollars(saved.extra) === null)
const owing = computed(() => toPay.value.filter(p => p.status !== 'paid'))
const strategies = computed(() => {
  const list = owing.value.map(p => ({ id: p.d.id, name: p.d.name, owed_cents: p.d.owed_cents, payment_cents: p.payment_cents, apr: p.apr }))
  const base = strategyPlan(list, 0, 'avalanche', today)
  return { base, plans: STRATEGIES.map(s => ({ ...s, ...strategyPlan(list, extra.value, s.id, today) })) }
})
const sameOrder = computed(() => {
  const [a, b] = strategies.value.plans
  return !!a && !!b && a.order.map(d => d.id).join() === b.order.map(d => d.id).join()
})
// Whether a card is paid in full each month is the person's word on the account (PATCH /api/accounts/:id), or Cheddar's from its payments.
const inFullAction = useAction()
const savingInFull = ref('')
async function setInFull(d: Debt, value: PaidInFull) {
  savingInFull.value = d.id
  const ok = await inFullAction.run(() => $fetch(`/api/accounts/${d.id}`, { method: 'PATCH', body: { paid_in_full: value } }))
  if (ok) await refresh()
  savingInFull.value = ''
}
const cheaper = computed(() => {
  const [a, b] = strategies.value.plans
  if (!a || !b || a.months === null || b.months === null) return null
  return a.interest_cents === b.interest_cents ? null : a.interest_cents < b.interest_cents ? { by: a, other: b } : { by: b, other: a }
})
</script>

<template>
  <div>
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
            <p class="footnote">Your savings rate shows here once your accounts have income or spending from the last {{ months.length || 6 }} whole months. Link or import them in <NuxtLink to="/settings#accounts">Settings</NuxtLink>.</p>
          </div>
          <p class="group-footer">From the last whole months; this month counts once it's over. Moving money between your own accounts counts as neither.</p>
        </section>
      </div>
      <div>
        <section class="group" aria-labelledby="debt-title">
          <h2 id="debt-title" class="group-title">Paying off debt</h2>
          <div v-if="plans.length" class="card">
            <div v-if="!toPay.length" class="card-pad hero">
              <p class="large-title" data-test="debt-free">Nothing to pay off</p>
              <p class="footnote">You pay {{ inFull.length === 1 ? 'your card' : 'your cards' }} in full each month, so there's no debt to wait out.</p>
            </div>
            <div v-else class="card-pad hero">
              <p v-if="debtFree" class="num large-title" data-test="debt-free">{{ monthName(debtFree, true) }}</p>
              <p v-else class="num large-title loss" data-test="debt-free">Not yet</p>
              <p class="footnote">
                <template v-if="debtFree">is when you'd be debt free at these payments, from {{ formatCents(toPay.reduce((s, p) => s + p.d.owed_cents, 0)) }} owed today. An estimate.</template>
                <template v-else>Not every debt below has a payoff date at its payment. Each says why.</template>
              </p>
              <p v-if="noRate.length" class="footnote warn-text" data-test="no-apr">
                Interest isn't included for {{ names(noRate) }}: no APR entered, so {{ noRate.length === 1 ? 'its date is' : 'their dates are' }} sooner than it would really be. Enter the APR below.
              </p>
            </div>
            <div v-for="p in toPay" :key="p.d.id" class="debt" :data-test="`debt-${p.d.name}`">
              <div class="row">
                <span class="row-label">
                  <span class="block headline">{{ p.d.name }}</span>
                  <span class="footnote block" data-test="debt-estimate">
                    <template v-if="p.status === 'paid'">Paid off.</template>
                    <template v-else-if="p.status === 'estimate' && p.apr !== null">Estimated payoff {{ monthName(p.when, true) }} ({{ span(p.payoff!.months) }}), {{ formatCents(p.payoff!.interest_cents) }} in interest</template>
                    <template v-else-if="p.status === 'estimate'">Estimated payoff {{ monthName(p.when, true) }} ({{ span(p.payoff!.months) }}) <strong class="warn-text">if no interest is charged</strong></template>
                    <template v-else-if="p.status === 'outpaced'"><span class="loss">No payoff date:</span> {{ formatCents(p.payment_cents) }} a month <template v-if="p.apr">doesn't outrun {{ aprText(p.apr) }} interest.</template><template v-else>would take over {{ MAX_PAYOFF_MONTHS / 12 }} years.</template></template>
                    <template v-else-if="p.status === 'not_shrinking'"><span class="loss">No payoff date:</span> it's grown by {{ formatCents(-(p.d.paydown_cents ?? 0)) }} a month lately. Enter what you plan to pay.</template>
                    <template v-else>No payoff date: Cheddar hasn't seen this balance change yet. Enter what you pay, or bring the balance up to date in <NuxtLink to="/settings#accounts">Settings</NuxtLink> now and then.</template>
                  </span>
                </span>
                <span class="row-value"><span class="num block loss">{{ formatCents(-p.d.owed_cents) }}</span></span>
              </div>
              <div class="debt-fields">
                <label>
                  <span class="field-label">Monthly payment</span>
                  <input
                    class="input num" inputmode="decimal" :value="saved.debts[p.d.id]?.payment ?? ''"
                    :placeholder="p.d.paydown_cents && p.d.paydown_cents > 0 ? formatCents(p.d.paydown_cents) : 'Enter it'"
                    :aria-describedby="`pay-${p.d.id}`" data-test="debt-payment"
                    @input="setDebt(p.d.id, 'payment', ($event.target as HTMLInputElement).value)"
                  >
                  <span :id="`pay-${p.d.id}`" class="footnote source">
                    <template v-if="p.payment_source === 'entered'">Yours. <button class="link" type="button" @click="setDebt(p.d.id, 'payment', '')">{{ p.d.paydown_cents && p.d.paydown_cents > 0 ? `Use the pace (${formatCents(p.d.paydown_cents)})` : 'Clear' }}</button></template>
                    <template v-else-if="p.payment_source === 'inferred'">Inferred: {{ paceFrom(p.d) }}.</template>
                    <template v-else>Unknown.</template>
                  </span>
                </label>
                <label>
                  <span class="field-label">Interest rate (APR %)</span>
                  <input
                    class="input num" inputmode="decimal" placeholder="Unknown" :value="saved.debts[p.d.id]?.apr ?? ''"
                    :aria-describedby="`apr-${p.d.id}`" data-test="debt-apr"
                    @input="setDebt(p.d.id, 'apr', ($event.target as HTMLInputElement).value)"
                  >
                  <span :id="`apr-${p.d.id}`" class="footnote source">
                    <template v-if="p.apr !== null">Yours.</template>
                    <template v-else><span class="warn-text">Unknown, so interest isn't included.</span> It's on your statement.</template>
                  </span>
                </label>
              </div>
              <div v-if="p.d.paid_in_full !== null" class="in-full">
                <label class="check">
                  <input type="checkbox" :checked="false" :disabled="savingInFull === p.d.id" data-test="paid-in-full" @change="setInFull(p.d, 'yes')">
                  <span>I pay it in full each month</span>
                </label>
                <span class="footnote source">
                  Then it has nothing to pay off, and it's left out of the dates here.
                  <template v-if="p.d.paid_in_full_source === 'entered'"><button class="link" type="button" @click="setInFull(p.d, '')">Let Cheddar tell from its payments</button></template>
                </span>
              </div>
            </div>
            <div v-if="inFull.length" class="in-full-list" data-test="in-full">
              <h3 class="headline card-pad sub-head">Paid in full each month</h3>
              <div v-for="p in inFull" :key="p.d.id" class="debt" :data-test="`in-full-${p.d.name}`">
                <div class="row">
                  <span class="row-label">
                    <span class="block headline">{{ p.d.name }}</span>
                    <span class="footnote block">
                      Nothing to pay off: only the latest statement is owed.
                      <template v-if="p.d.paid_in_full_source === 'inferred'">Cheddar can tell from its payments: they cover what's charged, with no interest.</template>
                    </span>
                  </span>
                  <span class="row-value"><span class="num block loss">{{ formatCents(-p.d.owed_cents) }}</span></span>
                </div>
                <div class="in-full">
                  <label class="check">
                    <input type="checkbox" :checked="true" :disabled="savingInFull === p.d.id" data-test="paid-in-full" @change="setInFull(p.d, 'no')">
                    <span>I pay it in full each month</span>
                  </label>
                  <span class="footnote source">
                    Untick it to see when it'd be paid off.
                    <template v-if="p.d.paid_in_full_source === 'entered'"><button class="link" type="button" @click="setInFull(p.d, '')">Let Cheddar tell from its payments</button></template>
                  </span>
                </div>
              </div>
            </div>
            <p v-if="inFullAction.error.value" class="card-pad notice notice-error" role="alert">{{ inFullAction.error.value }}</p>
            <p class="footnote card-pad note">
              Estimates, not promises: they assume the same payment every month, no new charges, and the APR above.
              Past {{ MAX_PAYOFF_MONTHS / 12 }} years counts as never. This browser remembers what you enter; whether a card is paid in full stays with the card (Settings can change it too).
            </p>
          </div>
          <div v-if="owing.length > 1" class="card strategies" data-test="strategies">
            <div class="card-pad">
              <h3 class="headline">Pay them off together</h3>
              <p class="footnote">
                Keep paying each its own payment, add an extra amount a month, and send it, with each paid-off debt's payment, to one debt at a time.
              </p>
              <label class="extra">
                <span class="field-label">Extra each month</span>
                <input v-model="saved.extra" class="input num" inputmode="decimal" placeholder="$0" :aria-invalid="extraBad" data-test="extra">
                <span v-if="extraBad" class="footnote loss">Enter an amount, like 200.</span>
              </label>
            </div>
            <div class="compare">
              <div v-for="sp in strategies.plans" :key="sp.id" class="plan" :data-test="`strategy-${sp.id}`">
                <p class="headline">{{ sp.label }}</p>
                <p class="footnote">{{ sp.rule }}</p>
                <template v-if="sp.months !== null">
                  <p class="num title-2">{{ monthName(sp.when, true) }}</p>
                  <p class="footnote">Debt free in {{ span(sp.months) }} · <span class="num">{{ formatCents(sp.interest_cents) }}</span> interest</p>
                  <ol class="order footnote">
                    <li v-for="d in sp.order" :key="d.id">{{ d.name }} <span class="muted">· {{ monthName(d.when, true) }}</span></li>
                  </ol>
                </template>
                <p v-else class="footnote"><span class="loss">Never:</span> these payments don't outrun the interest. Add more each month.</p>
              </div>
            </div>
            <p class="footnote card-pad note">
              <template v-if="sameOrder">Both pay them off in the same order here. </template>
              <template v-if="cheaper">{{ cheaper.by.label }} saves {{ formatCents(cheaper.other.interest_cents - cheaper.by.interest_cents) }} in interest over {{ cheaper.other.label.toLowerCase() }}. </template>
              <template v-if="strategies.base.months !== null && extra > 0">Without the extra: {{ monthName(strategies.base.when, true) }}, {{ formatCents(strategies.base.interest_cents) }} interest. </template>
              Uses each debt's payment and APR above{{ noRate.length ? '; interest is left out where there is no APR' : '' }}.
            </p>
          </div>
          <div v-else-if="!plans.length" class="card card-pad">
            <p class="footnote">No card or loan owes anything. Cards and loans you add in <NuxtLink to="/settings#accounts">Settings</NuxtLink> show when they'll be paid off here.</p>
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
        Starts from your brokerage and retirement balances<template v-if="!pj?.has_investments"> (none yet: add them in <NuxtLink to="/settings#accounts">Settings</NuxtLink>)</template>, before taxes and fees. This browser remembers your assumptions.
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
.strategies { margin-top: 1rem; }
.extra { display: flex; flex-direction: column; gap: 0.25rem; max-width: 12rem; margin-top: 0.75rem; }
.compare { display: grid; grid-template-columns: 1fr 1fr; border-top: var(--border); }
.compare .plan { padding: 0.875rem 1rem; }
.compare .plan + .plan { border-left: var(--border); }
.compare p { margin: 0 0 0.25rem; }
.order { margin: 0.5rem 0 0; padding-left: 1.25rem; }
@media (max-width: 30rem) { .compare { grid-template-columns: 1fr; } .compare .plan + .plan { border-left: 0; border-top: var(--border); } }
.debt .row-value { display: flex; flex-direction: column; align-items: flex-end; }
.debt-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding: 0 1rem 0.875rem; }
.debt-fields label { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.source { color: var(--text-2); }
.warn-text { color: var(--warning); font-weight: 600; }
.note { border-top: 0.5px solid var(--separator); color: var(--text-2); margin: 0; }
@media (max-width: 30rem) { .debt-fields { grid-template-columns: 1fr; } }
.in-full { display: flex; flex-direction: column; gap: 0.125rem; padding: 0 1rem 0.875rem; }
.check { display: flex; gap: 0.625rem; align-items: center; min-height: 2.75rem; }
.check input { width: 1.25rem; height: 1.25rem; accent-color: var(--accent); }
.in-full-list { border-top: var(--border); }
.sub-head { margin: 0; padding-bottom: 0; }
</style>
