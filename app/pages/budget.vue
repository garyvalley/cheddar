<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { moveBudget, planTotals, type BudgetPlan } from '~~/shared/budget-plan'
import { checkBudget } from '~~/shared/budgets'

// The monthly plan: every spending category's monthly budget in one place,
// beside what it came to in the month shown, with the plan's totals following
// each change as it's typed (shared/budget-plan.ts). Changes are kept only
// once saved; suggestions fill a box but are never saved on their own.

const route = useRoute()
const router = useRouter()
const month = computed(() => (typeof route.query.month === 'string' ? route.query.month : undefined))
const { data: plan, error, refresh } = await useFetch<BudgetPlan & { label: string, prev: string, next: string }>('/api/budgets/plan', {
  query: computed(() => (month.value ? { month: month.value } : {})),
})

// What's typed in each budget box, as dollars; '' for none. And whether each rolls over.
const typed = reactive<Record<string, string>>({})
const rolls = reactive<Record<string, boolean>>({})
const asTyped = (cents: number | null) => (cents ? (cents / 100).toFixed(2).replace(/\.00$/, '') : '')
function reset() {
  for (const l of plan.value?.lines ?? []) {
    typed[l.id] = asTyped(l.budget_cents)
    rolls[l.id] = l.rollover
  }
}
watch(plan, reset, { immediate: true })

const checked = (id: string) => checkBudget(typed[id] ?? '')
const cents = (id: string) => {
  const c = checked(id)
  return 'ok' in c ? c.ok : null
}
const lines = computed(() => (plan.value?.lines ?? []).map((l) => {
  const draft = cents(l.id)
  const bad = 'problem' in checked(l.id)
  // A budget being removed can't roll over; what carries is the saved budget's until it's saved.
  const roll = !!draft && !!rolls[l.id]
  return { ...l, draft, bad, roll, carry: roll ? l.carry_cents : 0, changed: !bad && (draft !== l.budget_cents || (!!draft && roll !== l.rollover)) }
}))
const totals = computed(() => planTotals(lines.value.map(l => ({ budget_cents: l.draft, spent_cents: l.spent_cents, carry_cents: l.carry })), plan.value?.income_cents ?? 0))
const changed = computed(() => lines.value.filter(l => l.changed))
const suggestable = computed(() => lines.value.filter(l => !l.draft && l.suggested_cents))
const suggestedNow = ref(new Set<string>())

function useSuggestion(id: string, s: number) {
  typed[id] = asTyped(s)
  suggestedNow.value.add(id)
}
function useAllSuggestions() {
  for (const l of suggestable.value) useSuggestion(l.id, l.suggested_cents!)
}

const save = useAction()
const notice = ref('')
async function saveAll() {
  notice.value = ''
  const list = changed.value
  if (!await save.succeed(async () => {
    for (const l of list) await $fetch(`/api/budgets/${l.id}`, { method: 'PUT', body: { amount: l.draft ? (l.draft / 100).toFixed(2) : '', ...(l.draft ? { rollover: l.roll } : {}) } })
  })) return
  suggestedNow.value = new Set()
  await refresh()
  notice.value = `Saved ${list.length} ${list.length === 1 ? 'budget' : 'budgets'}.`
}
function discard() {
  reset()
  suggestedNow.value = new Set()
  notice.value = ''
}

// Moving budget from one category to another: both boxes change, and the plan's total stays.
const move = reactive({ amount: '', from: '', to: '', problem: '' })
const moving = ref(false)
function doMove() {
  const amount = checkBudget(move.amount)
  if (!('ok' in amount) || !amount.ok) {
    move.problem = 'Enter an amount to move.'
    return
  }
  if (!move.from || !move.to || move.from === move.to) {
    move.problem = 'Pick two different categories.'
    return
  }
  const r = moveBudget(cents(move.from), cents(move.to), amount.ok)
  if ('problem' in r) {
    move.problem = r.problem
    return
  }
  typed[move.from] = asTyped(r.from)
  typed[move.to] = asTyped(r.to)
  suggestedNow.value.delete(move.from)
  suggestedNow.value.delete(move.to)
  Object.assign(move, { amount: '', problem: '' })
  moving.value = false
}

const go = (m: string) => router.push({ query: { ...route.query, month: m } })
const left = (l: { draft: number | null, carry: number, spent_cents: number }) => (l.draft ?? 0) + l.carry - l.spent_cents
const available = (l: { draft: number | null, carry: number }) => Math.max(1, (l.draft ?? 0) + l.carry)
</script>

<template>
  <div>
    <AppHeader title="Monthly plan" sub="Every category's monthly budget in one place, against what the month came to.">
      <NuxtLink to="/spending" class="btn btn-tinted">Spending</NuxtLink>
    </AppHeader>

    <p v-if="error" class="notice notice-error group" role="alert">{{ errorMessage(error) }}</p>

    <template v-if="plan">
      <section class="group toolbar" aria-label="Which month">
        <div class="stepper">
          <button class="btn btn-plain" :aria-label="`Before ${plan.label}`" @click="go(plan.prev)"><AppIcon name="chevron" class="back" /></button>
          <span class="headline num when" aria-live="polite">{{ plan.label }}</span>
          <button class="btn btn-plain" :aria-label="`After ${plan.label}`" @click="go(plan.next)"><AppIcon name="chevron" /></button>
        </div>
      </section>

      <section class="group" aria-labelledby="totals-title">
        <h2 id="totals-title" class="visually-hidden">The plan's totals</h2>
        <div class="card card-pad">
          <dl class="figures" data-test="plan-totals">
            <div><dt>Planned</dt><dd class="num" data-test="planned">{{ formatCents(totals.planned_cents) }}</dd></div>
            <div v-if="totals.carry_cents"><dt>Rolled over</dt><dd class="num" :class="moneyTone(totals.carry_cents)" data-test="carried">{{ totals.carry_cents > 0 ? '+' : '−' }}{{ formatCents(Math.abs(totals.carry_cents)) }}</dd></div>
            <div><dt>Spent in budgeted</dt><dd class="num" :class="spendTone(totals.spent_budgeted_cents)">{{ formatCents(totals.spent_budgeted_cents) }}</dd></div>
            <div>
              <dt>{{ totals.remaining_cents >= 0 ? 'Left in the plan' : 'Over the plan' }}</dt>
              <dd class="num" :class="moneyTone(totals.remaining_cents)" data-test="remaining">{{ formatCents(Math.abs(totals.remaining_cents)) }}</dd>
            </div>
            <div><dt>Spent without a budget</dt><dd class="num" :class="spendTone(totals.unbudgeted_cents)">{{ formatCents(totals.unbudgeted_cents) }}</dd></div>
            <div><dt>Income this month</dt><dd class="num" :class="moneyTone(plan.income_cents)">{{ formatCents(plan.income_cents) }}</dd></div>
            <div>
              <dt>{{ totals.unplanned_income_cents >= 0 ? 'Income not in the plan' : 'Plan beyond income' }}</dt>
              <dd class="num" :class="moneyTone(totals.unplanned_income_cents)" data-test="unplanned">{{ formatCents(Math.abs(totals.unplanned_income_cents)) }}</dd>
            </div>
          </dl>
          <p class="footnote muted">
            A plan is what your spending should come to. It doesn't set money aside or move any: your accounts hold what they hold.
            Budgets repeat every month; savings goals are on <NuxtLink to="/goals">Goals</NuxtLink>.
            Tick Roll over on a budget for something that doesn't come every month, such as car repairs or gifts: what a month leaves carries into the next, from the month you tick it, and overspending comes off the next one.
          </p>
        </div>
      </section>

      <section class="group" aria-labelledby="lines-title">
        <div class="lines-head">
          <h2 id="lines-title" class="group-title">Categories</h2>
          <div class="btn-row">
            <button v-if="suggestable.length" class="btn btn-plain" data-test="suggest-all" @click="useAllSuggestions">Suggest budgets for {{ suggestable.length }} without one</button>
            <button class="btn btn-plain" :aria-expanded="moving" @click="moving = !moving">Move budget…</button>
          </div>
        </div>

        <form v-if="moving" class="card card-pad move" @submit.prevent="doMove">
          <label><span class="field-label">Move</span><input v-model="move.amount" class="input num" inputmode="decimal" placeholder="$0.00" data-test="move-amount"></label>
          <label>
            <span class="field-label">From</span>
            <select v-model="move.from" class="select" data-test="move-from">
              <option value="" disabled>Pick one</option>
              <option v-for="l in lines.filter(x => x.draft)" :key="l.id" :value="l.id">{{ l.label }} ({{ formatCents(l.draft ?? 0) }})</option>
            </select>
          </label>
          <label>
            <span class="field-label">To</span>
            <select v-model="move.to" class="select" data-test="move-to">
              <option value="" disabled>Pick one</option>
              <option v-for="l in lines" :key="l.id" :value="l.id">{{ l.label }}</option>
            </select>
          </label>
          <button class="btn btn-tinted">Move</button>
          <p v-if="move.problem" class="footnote loss full" role="alert">{{ move.problem }}</p>
        </form>

        <div class="card">
          <div v-for="l in lines" :key="l.id" class="row line" :data-test="`line-${l.id}`">
            <span class="row-label">
              <NuxtLink :to="{ path: '/spending', query: { category: l.id, at: plan.month } }" class="name">{{ l.label }}</NuxtLink>
              <span class="footnote block">
                Spent <span class="num">{{ formatCents(l.spent_cents) }}</span>
                <template v-if="l.draft">
                  · <span v-if="left(l) < 0" class="loss">{{ formatCents(-left(l)) }} over</span><template v-else>{{ formatCents(left(l)) }} left</template>
                </template>
              </span>
              <span v-if="l.carry" class="footnote block" data-test="carry">
                <template v-if="l.carry > 0"><span class="gain">{{ formatCents(l.carry) }}</span> rolled over from earlier months</template>
                <template v-else><span class="loss">{{ formatCents(-l.carry) }}</span> overspent in earlier months comes off this one</template>
              </span>
              <span v-if="l.draft" class="bar" aria-hidden="true"><span class="bar-fill" :class="left(l) < 0 ? 'over' : 'under'" :style="{ width: `${Math.min(100, Math.max(0, l.spent_cents / available(l) * 100)).toFixed(1)}%` }" /></span>
              <span v-if="suggestedNow.has(l.id) && l.changed" class="footnote block hint">Suggested from the last 3 months. Change it or clear it before you save.</span>
              <button v-else-if="!l.draft && l.suggested_cents" class="btn btn-plain suggest" type="button" @click="useSuggestion(l.id, l.suggested_cents)">
                Suggested: {{ formatCents(l.suggested_cents) }} (3-month average)
              </button>
            </span>
            <label class="amount">
              <span class="visually-hidden">Monthly budget for {{ l.label }}</span>
              <input v-model="typed[l.id]" class="input num" inputmode="decimal" placeholder="No budget" :aria-invalid="l.bad" data-test="budget">
              <span v-if="l.bad" class="footnote loss">Enter an amount, like 250.</span>
              <span v-else-if="l.changed" class="footnote changed">Not saved</span>
            </label>
            <label v-if="l.draft" class="roll" :title="`Carry what ${l.label} leaves each month, or overspends, into the next`">
              <input v-model="rolls[l.id]" type="checkbox" data-test="rollover">
              <span class="footnote">Roll over</span>
            </label>
          </div>
        </div>
      </section>

      <div v-if="changed.length || notice || save.error.value" class="savebar group" role="region" aria-label="Save the plan">
        <p v-if="save.error.value" class="notice notice-error" role="alert">{{ save.error.value }}</p>
        <p v-else-if="notice && !changed.length" class="notice notice-success" role="status">{{ notice }}</p>
        <div v-if="changed.length" class="btn-row">
          <button class="btn btn-primary" :disabled="save.busy.value || lines.some(l => l.bad)" data-test="save-plan" @click="saveAll">
            <span v-if="save.busy.value" class="spinner" aria-hidden="true" /> Save {{ changed.length }} {{ changed.length === 1 ? 'change' : 'changes' }}
          </button>
          <button class="btn btn-plain" :disabled="save.busy.value" @click="discard">Discard</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.toolbar { display: flex; justify-content: center; }
.stepper { display: inline-flex; align-items: center; gap: 0.25rem; }
.back { transform: rotate(180deg); }
.when { min-width: 9rem; text-align: center; }

.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem 0.75rem; margin: 0 0 1rem; }
.figures dt { font-size: 0.8125rem; color: var(--text-2); }
.figures dd { margin: 0; font-size: 1.125rem; font-weight: 600; }
@media (max-width: 40rem) { .figures { grid-template-columns: repeat(2, 1fr); } }

.lines-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
.lines-head .group-title { margin: 0; }

.move { display: grid; grid-template-columns: 1fr 1.5fr 1.5fr auto; gap: 0.75rem; align-items: end; margin-bottom: 0.75rem; }
.move .full { grid-column: 1 / -1; margin: 0; }
@media (max-width: 40rem) { .move { grid-template-columns: 1fr 1fr; } }

.line { align-items: flex-start; }
.name { color: var(--text); font-weight: 500; }
.amount { flex: 0 0 9rem; display: flex; flex-direction: column; gap: 0.25rem; }
.amount .input { text-align: right; }
.roll { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.125rem; min-width: 4.5rem; padding-top: 0.625rem; }
.roll input { width: 1.25rem; height: 1.25rem; accent-color: var(--accent); }
.changed { color: var(--warning); font-weight: 600; text-align: right; }
.hint { color: var(--warning); }
.suggest { min-height: 2rem; padding: 0; font-size: 0.875rem; font-weight: 500; }

/* Within budget is a neutral progress bar; over it is the fixed loss red. */
.bar { display: block; height: 0.375rem; border-radius: 999px; background: var(--surface-2); margin: 0.375rem 0; max-width: 20rem; overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: inherit; }
.bar-fill.under { background: var(--accent); }
.bar-fill.over { background: var(--loss); }

.savebar { position: sticky; bottom: 1rem; z-index: 5; display: grid; gap: 0.5rem; padding: 0.75rem; background: var(--surface); border: var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
@media (max-width: 767px) { .savebar { bottom: calc(4.5rem + env(safe-area-inset-bottom)); } .amount { flex-basis: 7.5rem; } }
</style>
