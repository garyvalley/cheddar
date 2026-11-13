<script setup lang="ts">
import { ACCOUNT_KINDS, isLiability, type Account, type AccountKind } from '~~/shared/accounts'

// Everything a person can change about an account, linked or not: what it's
// called and what kind it is, whether it's closed, and whether Cheddar counts it.
// PATCH /api/accounts/:id takes the lot.
const props = defineProps<{
  account: Pick<Account, 'id' | 'name' | 'kind' | 'institution' | 'last4' | 'closed_on' | 'excluded' | 'linked'>
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
})
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
        <span>Count it in Overview, Spending, Projections and Taxes</span>
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
</style>
