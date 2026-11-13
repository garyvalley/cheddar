<script setup lang="ts">
import { formatCents, parseBalance, type Account } from '~~/shared/accounts'
import { FILING_STATUSES, isFilingStatus } from '~~/shared/filing-status'
import { stateEstimate } from '~~/shared/state-taxes'
import { stateByCode } from '~~/shared/states'
import { LIMITS, TAX_YEAR, estimate, ideas, type TaxYear } from '~~/shared/taxes'

// Taxes only reads what the accounts hold (set up on Accounts): this year's
// income and tax payments from their categorized transactions, and money
// moved into retirement accounts. The person's state and filing status come
// from Settings; the yearly income can be changed here to try another figure,
// and isn't saved.

const { me } = useAuth()
const { data: list } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const { data: ty, error } = await useFetch<TaxYear>('/api/taxes')

const status = computed(() => (isFilingStatus(me.value?.filing_status) ? me.value.filing_status : 'single'))
const statusLabel = computed(() => FILING_STATUSES.find(s => s.value === status.value)!.label.toLowerCase())
const state = computed(() => stateByCode(me.value?.state))

const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const whole = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(cents / 100))
const pct = (f: number) => `${(f * 100).toFixed(1)}%`

// The year's income: at this year's pace, unless the person types another figure.
const pace = computed(() => ty.value?.projected_income_cents ?? ty.value?.income_cents ?? 0)
const typed = ref('')
const typedCents = computed(() => {
  if (!typed.value.trim()) return null
  const p = parseBalance(typed.value, 'checking')
  return 'ok' in p && p.ok >= 0 ? p.ok : undefined
})
const income = computed(() => typedCents.value ?? pace.value)
const est = computed(() => estimate(income.value, status.value))
const stateEst = computed(() => stateEstimate(state.value?.code, income.value, status.value, est.value.tax_cents))
const shownIdeas = computed(() => (ty.value ? ideas(est.value, ty.value, state.value?.name ?? '', stateEst.value?.marginal ?? 0) : []))

// Each bracket's bar fills with the share of it the income uses; the top one, unbounded, is drawn as long as the one before.
const bars = computed(() => est.value.brackets.map((b, i, all) => {
  const span = (b.to_cents ?? b.from_cents + (all[i - 1]!.to_cents! - all[i - 1]!.from_cents)) - b.from_cents
  return { ...b, fill: Math.min(1, b.taxed_cents / span), current: b.rate === est.value.marginal }
}))

const iraLeft = computed(() => Math.max(0, LIMITS.ira * 100 - (ty.value?.retirement_in_cents ?? 0)))
</script>

<template>
  <div>
    <AppHeader title="Taxes" />

    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <p v-if="!me?.filing_status || !me?.state" class="notice notice-info group">
      Choose your {{ !me?.filing_status ? 'filing status' : '' }}{{ !me?.filing_status && !me?.state ? ' and ' : '' }}{{ !me?.state ? 'state' : '' }} in
      <NuxtLink to="/settings">Settings</NuxtLink>{{ !me?.filing_status ? ', so the brackets are yours. Until then, this uses single' : '' }}.
    </p>

    <section class="group" aria-labelledby="year-title">
      <h2 id="year-title" class="group-title">{{ TAX_YEAR }} so far</h2>
      <div v-if="ty && list.accounts.length" class="card">
        <div class="row">
          <span class="row-label">
            <span class="block">Income</span>
            <span class="footnote">Since {{ day(ty.from) }}</span>
          </span>
          <span class="num gain" data-test="ytd-income">{{ formatCents(ty.income_cents) }}</span>
        </div>
        <div class="row">
          <span class="row-label">
            <span class="block">Tax payments</span>
            <span class="footnote">Estimated payments and amounts due, not payroll withholding</span>
          </span>
          <span class="num" :class="moneyTone(-ty.tax_paid_cents)">{{ ty.tax_paid_cents > 0 ? formatCents(-ty.tax_paid_cents) : formatCents(0) }}</span>
        </div>
        <div v-if="ty.has_retirement" class="row">
          <span class="row-label">
            <span class="block">Moved into retirement accounts</span>
          </span>
          <span class="num" :class="moneyTone(ty.retirement_in_cents)">{{ formatCents(ty.retirement_in_cents) }}</span>
        </div>
      </div>
      <div v-else class="card card-pad">
        <p class="footnote">Connect your accounts on <NuxtLink to="/accounts">Accounts</NuxtLink>. Your income this year, and the tax on it, are worked out from their transactions.</p>
      </div>
    </section>

    <div class="cols">
      <div>
        <section class="group" aria-labelledby="est-title">
          <h2 id="est-title" class="group-title">Federal estimate</h2>
          <div class="card">
            <div class="card-pad hero">
              <p class="num large-title" :class="moneyTone(-est.tax_cents)" data-test="federal-tax">{{ whole(est.tax_cents) }}</p>
              <p class="footnote">
                {{ pct(est.effective) }} of your income overall, and {{ est.marginal }}% on your next dollar, filing {{ statusLabel }}.
              </p>
            </div>
            <label class="field">
              <span class="field-label">Yearly income before tax</span>
              <input
                v-model="typed" class="input num" inputmode="decimal" :placeholder="whole(pace)"
                :aria-invalid="typedCents === undefined" aria-describedby="income-hint" data-test="income"
              >
              <span id="income-hint" class="footnote">
                <template v-if="typedCents === undefined">Enter an amount, like 85,000.</template>
                <template v-else-if="typedCents !== null">Your own figure, for this page only. <button class="link" type="button" @click="typed = ''">Use your accounts' instead</button></template>
                <template v-else-if="ty?.projected_income_cents">Your income so far, at the same pace through December.</template>
                <template v-else>Your income so far. It's projected to December once Cheddar has a month of it.</template>
              </span>
            </label>
            <div class="row">
              <span class="row-label">Income</span>
              <span class="num" :class="moneyTone(est.income_cents)">{{ whole(est.income_cents) }}</span>
            </div>
            <div class="row">
              <span class="row-label">Standard deduction</span>
              <span class="num gain">−{{ whole(est.deduction_cents) }}</span>
            </div>
            <div class="row">
              <span class="row-label">Taxable income</span>
              <span class="num">{{ whole(est.taxable_cents) }}</span>
            </div>
            <div class="row">
              <span class="row-label"><strong>Federal income tax</strong></span>
              <span class="num loss"><strong>{{ whole(est.tax_cents) }}</strong></span>
            </div>
          </div>
          <p class="group-footer">
            Deposits are take-home pay, after payroll withholding and pre-tax savings, so your income before tax is likely higher: enter it from a pay stub for a closer estimate.
            Payroll taxes, credits and itemized deductions aren't counted.
          </p>
        </section>

        <section class="group" aria-labelledby="brackets-title">
          <h2 id="brackets-title" class="group-title">Your brackets</h2>
          <div class="card">
            <div v-for="b in bars" :key="b.rate" class="row bracket" :class="{ current: b.current }">
              <span class="rate num">{{ b.rate }}%</span>
              <span class="row-label">
                <span class="track" aria-hidden="true"><span class="fill" :style="{ width: `${b.fill * 100}%` }" /></span>
                <span class="footnote">
                  {{ b.to_cents === null ? `Over ${whole(b.from_cents)}` : `${whole(b.from_cents)} to ${whole(b.to_cents)}` }}
                  <template v-if="b.current && est.to_next_cents !== null"> · {{ whole(est.to_next_cents) }} until {{ bars[bars.indexOf(b) + 1]!.rate }}%</template>
                </span>
              </span>
              <span class="num tax" :class="b.tax_cents ? 'loss' : 'muted'">{{ whole(b.tax_cents) }}</span>
            </div>
          </div>
          <p class="group-footer">
            Taxable income, filing {{ statusLabel }}. Each rate applies only to the part of your income inside its bracket.
          </p>
        </section>
      </div>
      <div>
        <section v-if="state" class="group" aria-labelledby="state-title">
          <h2 id="state-title" class="group-title">{{ state.name }} estimate</h2>
          <div v-if="stateEst" class="card">
            <div class="card-pad hero">
              <p class="num large-title" :class="moneyTone(-stateEst.tax_cents)" data-test="state-tax">{{ whole(stateEst.tax_cents) }}</p>
              <p class="footnote">
                {{ pct(stateEst.effective) }} of your income overall, and {{ stateEst.marginal }}% on your next dollar.
              </p>
            </div>
            <div class="row">
              <span class="row-label">Income</span>
              <span class="num" :class="moneyTone(stateEst.income_cents)">{{ whole(stateEst.income_cents) }}</span>
            </div>
            <div v-if="stateEst.deduction_cents" class="row">
              <span class="row-label">Deductions and exemptions</span>
              <span class="num gain">−{{ whole(stateEst.deduction_cents) }}</span>
            </div>
            <div class="row">
              <span class="row-label">Taxable income</span>
              <span class="num">{{ whole(stateEst.taxable_cents) }}</span>
            </div>
            <div v-if="stateEst.credit_cents" class="row">
              <span class="row-label">Personal credits</span>
              <span class="num gain">−{{ whole(stateEst.credit_cents) }}</span>
            </div>
            <div class="row">
              <span class="row-label"><strong>{{ state.name }} income tax</strong></span>
              <span class="num loss"><strong>{{ whole(stateEst.tax_cents) }}</strong></span>
            </div>
            <div class="row">
              <span class="row-label"><strong>Federal and state together</strong></span>
              <span class="num loss" data-test="total-tax"><strong>{{ whole(est.tax_cents + stateEst.tax_cents) }}</strong></span>
            </div>
          </div>
          <div v-else class="card card-pad">
            <p class="footnote">{{ state.name }} has no state income tax on wages, so federal is the whole bill.</p>
          </div>
          <p v-if="stateEst" class="group-footer">
            From {{ state.name }}'s {{ TAX_YEAR }} brackets, standard deduction and personal exemption{{ status === 'head_of_household' || status === 'married_separate' ? ', on the single schedule' : '' }}.
            Local income taxes, phase-outs at high incomes, dependents and credits aren't counted.
          </p>
        </section>

        <section class="group" aria-labelledby="room-title">
          <h2 id="room-title" class="group-title">Tax-advantaged savings in {{ TAX_YEAR }}</h2>
          <div class="card">
            <div class="row">
              <span class="row-label">
                <span class="block">401(k), 403(b) or 457</span>
                <span class="footnote">{{ whole(LIMITS.k401_catch_up * 100) }} more at 50 and over; {{ whole(LIMITS.k401_catch_up_60_63 * 100) }} at 60 to 63</span>
              </span>
              <span class="num">{{ whole(LIMITS.k401 * 100) }}</span>
            </div>
            <div class="row">
              <span class="row-label">
                <span class="block">IRA, traditional or Roth</span>
                <span class="footnote">
                  {{ whole(LIMITS.ira_catch_up * 100) }} more at 50 and over<template v-if="ty?.retirement_in_cents">; {{ whole(iraLeft) }} left if what you moved in was IRA money</template>
                </span>
              </span>
              <span class="num">{{ whole(LIMITS.ira * 100) }}</span>
            </div>
            <div class="row">
              <span class="row-label">
                <span class="block">HSA</span>
                <span class="footnote">With a high-deductible health plan; {{ whole(LIMITS.hsa_family * 100) }} for family coverage</span>
              </span>
              <span class="num">{{ whole(LIMITS.hsa_self * 100) }}</span>
            </div>
          </div>
          <p class="group-footer">
            401(k) contributions come out of your pay before it reaches the bank, so they don't show in your accounts. IRA money for {{ TAX_YEAR }} can go in until April 15, {{ TAX_YEAR + 1 }}.
          </p>
        </section>

        <section v-if="shownIdeas.length" class="group" aria-labelledby="ideas-title">
          <h2 id="ideas-title" class="group-title">Ideas</h2>
          <div class="card">
            <div v-for="i in shownIdeas" :key="i.id" class="card-pad idea" :data-test="`idea-${i.id}`">
              <p class="headline">{{ i.title }}</p>
              <p class="footnote">{{ i.body }}</p>
            </div>
          </div>
          <p class="group-footer">
            General ideas from your own figures, not tax advice.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Two columns side by side on a wide screen, one after the other on a phone. */
@media (min-width: 900px) {
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; align-items: start; }
}

.hero { border-bottom: var(--border); }
.hero .large-title { margin: 0 0 0.25rem; }
.field { border-bottom: var(--border); }
.field .input { max-width: 14rem; margin-bottom: 0.25rem; }
.field .footnote { display: block; }
.link { border: 0; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }

.bracket .rate { width: 2.75rem; flex: none; font-weight: 600; color: var(--text-2); }
.bracket.current { background: var(--accent-soft); }
.bracket.current .rate { color: var(--accent); }
.bracket .tax { min-width: 5.5rem; text-align: right; }
.track { display: block; height: 0.5rem; border-radius: 999px; background: var(--surface-2); overflow: hidden; margin-bottom: 0.375rem; }
.fill { display: block; height: 100%; border-radius: inherit; background: var(--accent); }

.idea + .idea { border-top: var(--border); }
.idea .headline { margin: 0 0 0.25rem; }
.idea .footnote { margin: 0; }
</style>
