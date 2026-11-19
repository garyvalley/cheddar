<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import type { Budget } from '~~/shared/budgets'
import type { SpendingSummary } from '~~/shared/categories'

// A spending category's monthly budget on its Spending page: how much of it
// the period has used, and setting, sharing or removing it. Emits `changed`
// once one is saved, so the page loads the budgets and totals again.

const props = defineProps<{
  category: string
  /** The category's row in the period's totals, with its budget for the span. */
  current?: SpendingSummary['categories'][number]
  periodLabel: string
  /** The person's budget for the category, their own or one shared with them. */
  budget?: Budget
}>()
const emit = defineEmits<{ changed: [] }>()

const thisBudget = computed(() => props.budget)
// Another category, or the same one in another view: the form closes.
watch(() => props.category, () => { budgeting.value = false })
const monthlyBudget = computed(() => thisBudget.value?.amount_cents ?? 0)
// A budget a household member shared: its amount can change here, nothing else.
const othersBudget = computed(() => thisBudget.value?.owner_name !== undefined)
const budgeting = ref(false)
const budgetInput = ref('')
const budgetShared = ref(false)
// Whether the person is in a household, asked once they open a budget of their own.
const inHousehold = ref(false)
const saving = useAction()
async function startBudget() {
  budgetInput.value = monthlyBudget.value ? (monthlyBudget.value / 100).toFixed(2) : ''
  budgetShared.value = !!thisBudget.value?.shared_with_household
  budgeting.value = true
  if (!othersBudget.value) {
    const h = await $fetch<{ household: { members: unknown[] } | null }>('/api/household').catch(() => null)
    inHousehold.value = (h?.household?.members.length ?? 0) > 1
  }
}
async function saveBudget(amount: string) {
  const share = !othersBudget.value && amount && (inHousehold.value || thisBudget.value?.shared_with_household) ? { shared: budgetShared.value } : {}
  if (!await saving.run(() => $fetch(`/api/budgets/${props.category}`, { method: 'PUT', body: { amount, ...share } }))) return
  budgeting.value = false
  emit('changed')
}
</script>

<template>
  <div class="budget">
    <template v-if="current?.budget_cents">
      <span class="bar" aria-hidden="true"><span class="bar-fill" :class="overBy(current) < 0 ? 'over' : 'under'" :style="{ width: budgetShare(current) }" /></span>
      <p class="footnote">
        {{ formatCents(current.budget_cents) }} budget for {{ periodLabel }} ·
        <span v-if="overBy(current) < 0" class="loss">{{ formatCents(-overBy(current)) }} over</span>
        <span v-else>{{ formatCents(overBy(current)) }} left</span>
        <template v-if="current.carry_cents">
          · includes {{ current.carry_cents > 0 ? `${formatCents(current.carry_cents)} rolled over` : `${formatCents(-current.carry_cents)} taken off for overspending` }} from earlier months
        </template>
      </p>
    </template>
    <form v-if="budgeting" class="inline-form" @submit.prevent="saveBudget(budgetInput)">
      <label class="visually-hidden" for="budget">Monthly budget</label>
      <input id="budget" v-model="budgetInput" class="input num" inputmode="decimal" placeholder="Monthly budget, $">
      <button class="btn btn-primary" :disabled="saving.busy.value"><span v-if="saving.busy.value" class="spinner" aria-hidden="true" /> Save</button>
      <button v-if="monthlyBudget && !othersBudget" type="button" class="btn btn-plain danger" :disabled="saving.busy.value" @click="saveBudget('')">Remove budget</button>
      <button type="button" class="btn btn-plain" @click="budgeting = false">Cancel</button>
      <label v-if="!othersBudget && (inHousehold || thisBudget?.shared_with_household)" class="check share">
        <input v-model="budgetShared" type="checkbox" data-test="share-budget">
        <span>Share with your household: everyone sees it and can change its amount</span>
      </label>
    </form>
    <p v-else class="btn-row">
      <button class="btn btn-tinted" @click="startBudget">{{ monthlyBudget ? `Budget: ${formatCents(monthlyBudget)} a month` : 'Set a monthly budget' }}</button>
    </p>
    <p v-if="othersBudget" class="footnote" data-test="budget-from">Shared by {{ thisBudget?.owner_name || 'a household member' }}: you can change its amount.</p>
    <p v-else-if="thisBudget?.shared_with_household" class="footnote">Shared with your household.</p>
    <p v-if="saving.error.value" class="notice notice-error" role="alert">{{ saving.error.value }}</p>
  </div>
</template>

<style scoped>
.budget { margin-top: 0.75rem; }
.budget .share { flex-basis: 100%; display: flex; gap: 0.5rem; align-items: center; }
.bar { display: block; height: 6px; margin: 0.375rem 0 0.25rem; border-radius: 3px; background: var(--surface-2); overflow: hidden; max-width: 28rem; }
.bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--loss); }
/* Within budget is a neutral progress bar; over it is the fixed loss red. */
.bar-fill.under { background: var(--text-3); }
.bar-fill.over { background: var(--loss); }
.inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.75rem; }
.inline-form .input { flex: 1 1 12rem; width: auto; }
.danger { color: var(--critical); }
</style>
