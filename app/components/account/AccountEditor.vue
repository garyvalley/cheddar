<script setup lang="ts">
import { ACCOUNT_KINDS, canPayInFull, isLiability, type Account, type AccountKind, type PaidInFull } from '~~/shared/accounts'
import { changesOnItsOwn } from '~~/shared/property'

// Everything a person can change about an account, linked or not: what it's
// called and what kind it is, whether it's closed, and whether Cheddar counts it.
// PATCH /api/accounts/:id takes the lot.
const props = defineProps<{
  account: Pick<Account, 'id' | 'name' | 'kind' | 'institution' | 'last4' | 'closed_on' | 'excluded' | 'linked' | 'yearly_change_bp' | 'paid_in_full'>
}>()
const emit = defineEmits<{ done: [saved: boolean] }>()

const today = useToday()
const a = props.account
const form = reactive({
  name: a.name,
  kind: a.kind as AccountKind,
  institution: a.institution,
  last4: a.last4,
  counted: !a.excluded,
  closed: !!a.closed_on,
  closedOn: a.closed_on || today,
  yearlyChange: a.yearly_change_bp ? String(a.yearly_change_bp / 100) : '',
  paidInFull: (a.paid_in_full ?? '') as PaidInFull,
})
const card = computed(() => canPayInFull(form.kind))
const grows = computed(() => !a.linked && changesOnItsOwn(form.kind))
const action = useAction()

// An unlinked balance was typed as money held or owed: it keeps its amount and counts the other way.
const flips = computed(() => !a.linked && isLiability(a.kind) !== isLiability(form.kind))

async function save() {
  const ok = await action.run(() => $fetch(`/api/accounts/${a.id}`, {
    method: 'PATCH',
    body: {
      name: form.name,
      kind: form.kind,
      institution: form.institution,
      last4: form.last4,
      excluded: !form.counted,
      closed_on: form.closed ? form.closedOn : '',
      ...(grows.value ? { yearly_change: form.yearlyChange } : {}),
      ...(card.value ? { paid_in_full: form.paidInFull } : {}),
    },
  }))
  if (ok) emit('done', true)
}
</script>

<template>
  <form class="editor" :aria-label="`Edit ${a.name}`" @submit.prevent="save">
    <label class="field">
      <span class="field-label">Name</span>
      <input v-model="form.name" class="input" maxlength="100" required autofocus>
    </label>
    <label class="field">
      <span class="field-label">Kind</span>
      <select v-model="form.kind" class="select">
        <option v-for="k in ACCOUNT_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </select>
      <span v-if="flips" class="footnote block hint">Its balance now counts as {{ isLiability(form.kind) ? 'owed' : 'money you hold' }}.</span>
    </label>
    <label v-if="grows" class="field">
      <span class="field-label">How much its value changes a year (optional)</span>
      <span class="pct"><input v-model="form.yearlyChange" class="input num" inputmode="decimal" placeholder="0" aria-describedby="yearly-help"><span aria-hidden="true">%</span></span>
      <span id="yearly-help" class="footnote block hint">3 for a home gaining 3% a year, -15 for a car losing 15%. Cheddar moves its value on each day, so it doesn't go out of date; a new value you type starts it again from there.</span>
    </label>
    <label v-if="card" class="field">
      <span class="field-label">Paid in full each month?</span>
      <select v-model="form.paidInFull" class="select" aria-describedby="in-full-help">
        <option value="">Let Cheddar tell from its payments</option>
        <option value="yes">Yes, every statement</option>
        <option value="no">No, I'm paying it down</option>
      </select>
      <span id="in-full-help" class="footnote block hint">A card paid in full has nothing to pay off, so Trends leaves it out of paying off debt.</span>
    </label>
    <label class="field">
      <span class="field-label">Bank or card issuer (optional)</span>
      <input v-model="form.institution" class="input" maxlength="100">
    </label>
    <label class="field">
      <span class="field-label">Last four digits (optional)</span>
      <input v-model="form.last4" class="input num" inputmode="numeric" maxlength="4" pattern="\d{4}">
    </label>
    <div class="field">
      <label class="check">
        <input v-model="form.closed" type="checkbox">
        <span>It's closed</span>
      </label>
      <label v-if="form.closed" class="closed-on">
        <span class="field-label">Closed on</span>
        <input v-model="form.closedOn" class="input" type="date" :max="today" required>
      </label>
      <span class="footnote block">
        A paid-off loan or a cancelled card: it leaves net worth from that day, and its transactions stay in past months' Spending and Taxes.
      </span>
    </div>
    <div class="field">
      <label class="check">
        <input v-model="form.counted" type="checkbox">
        <span>Count it in Overview, Spending, Trends and Taxes</span>
      </label>
      <span class="footnote block">
        Untick it for an account that isn't yours to count, such as a joint account.
        It stays here{{ a.linked ? ' and keeps updating' : '' }}, so you can count it again any time.
      </span>
    </div>
    <div class="field btn-row">
      <button class="btn btn-primary" :disabled="action.busy.value">
        <span v-if="action.busy.value" class="spinner" aria-hidden="true" /> Save
      </button>
      <button type="button" class="btn btn-plain" @click="emit('done', false)">Cancel</button>
    </div>
    <p v-if="action.error.value" class="field notice notice-error" role="alert">{{ action.error.value }}</p>
  </form>
</template>

<style scoped>
.editor { width: 100%; }
.check { display: flex; gap: 0.75rem; align-items: center; min-height: 2.75rem; }
.check input { width: 1.25rem; height: 1.25rem; accent-color: var(--accent); }
.closed-on { display: block; margin: 0.25rem 0 0.5rem; }
.closed-on .input { max-width: 12rem; }
.hint { margin-top: 0.375rem; }
.pct { display: flex; align-items: center; gap: 0.375rem; max-width: 9rem; }
</style>
