<script setup lang="ts">
import { formatCents, isStale, type Account } from '~~/shared/accounts'
import type { Overview } from '~~/shared/overview'

// Overview's first cards, each only when it has something to say: the
// set-up steps left, balances typed in long ago, and categories over this
// month's budget.

const props = defineProps<{ accounts: Account[], overBudget: Overview['over_budget'] }>()
const { me } = useAuth()
const today = useToday()

const steps = computed(() => [
  { done: !!me.value?.verified, label: 'Confirm your email', hint: 'So you can reset your password if you forget it.', to: '/settings' },
  {
    done: !!(me.value?.state && me.value?.filing_status),
    label: 'Choose your state and filing status',
    hint: 'Tax ideas use your own state\'s rules.',
    to: '/settings',
  },
  {
    done: props.accounts.length > 0,
    label: 'Connect your accounts',
    hint: 'Link your banks and cards, or import their statements. Everything here is worked out from them.',
    to: '/settings#accounts',
  },
])
const left = computed(() => steps.value.filter(s => !s.done).length)
// Typed-in balances past their age (shared/accounts.ts): net worth includes them.
const stale = computed(() => props.accounts.filter(a => isStale(a, today)))
</script>

<template>
  <div>
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
        <NuxtLink to="/settings#accounts" class="row step">
          <span class="row-label">
            <span class="step-label">{{ stale.length === 1 ? '1 balance is out of date' : `${stale.length} balances are out of date` }}</span>
            <span class="footnote">{{ stale.map(a => a.name).join(', ') }}: net worth, growth and Projections use {{ stale.length === 1 ? 'it' : 'them' }}. Bring {{ stale.length === 1 ? 'it' : 'them' }} up to date in Settings.</span>
          </span>
          <AppIcon name="chevron" class="chev" />
        </NuxtLink>
      </div>
    </section>

    <!-- Categories over this month's budget. -->
    <section v-if="overBudget.length" class="group" aria-labelledby="budget-title">
      <div class="card">
        <div class="panel-head">
          <h2 id="budget-title" class="panel-title">Over budget this month</h2>
        </div>
        <NuxtLink v-for="b in overBudget" :key="b.id" :to="{ path: '/spending', query: { category: b.id } }" class="row step">
          <span class="row-label">
            <span class="step-label">{{ b.label }}</span>
            <span class="footnote"><span class="loss">{{ formatCents(b.spent_cents - b.budget_cents) }} over</span> · {{ formatCents(b.spent_cents) }} of {{ formatCents(b.budget_cents) }}</span>
          </span>
          <AppIcon name="chevron" class="chev" />
        </NuxtLink>
      </div>
    </section>
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
@media (max-width: 560px) {
  .progress { width: 4.5rem; }
}
</style>
