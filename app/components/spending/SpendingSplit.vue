<script setup lang="ts">
import { formatCents, type Transaction } from '~~/shared/accounts'
import { categoryOf, type Category } from '~~/shared/categories'
import { MAX_PARTS, checkSplit, leftOver } from '~~/shared/splits'
import { parseAmount, shownName } from '~~/shared/transactions'

// Splitting one transaction across categories (shared/splits.ts): a part per
// category, each its share of the whole, given without a sign. The line
// under the parts says what's left to share out as the person types, and a
// new part starts with it. Saving an empty split undoes it.

const props = defineProps<{ transaction: Transaction, categories: Category[] }>()
const emit = defineEmits<{ saved: [message: string], cancel: [] }>()

const t = computed(() => props.transaction)
const whole = computed(() => Math.abs(t.value.amount_cents))
const size = (cents: number) => (Math.abs(cents) / 100).toFixed(2)
const label = (id: string) => categoryOf(id, props.categories).label

let next = 0
type Row = { key: number, category: string, amount: string }
const row = (category: string, amount: string): Row => ({ key: next++, category, amount })
const rows = ref<Row[]>(t.value.splits.length
  ? t.value.splits.map(p => row(p.category, size(p.amount_cents)))
  : [row(categoryOf(t.value.category, props.categories).id, size(whole.value)), row('', '')])

// What the parts typed so far come to, and what's still to share out.
const typed = computed(() => rows.value.reduce((n, r) => n + (parseAmount(r.amount)?.cents ?? 0), 0))
const rest = computed(() => whole.value - typed.value)
const status = computed(() => rest.value === 0
  ? 'The parts add up to the whole.'
  : rest.value > 0 ? `${formatCents(rest.value)} left to put in a part.` : `The parts come to ${formatCents(-rest.value)} more than the whole.`)

function add() {
  if (rows.value.length >= MAX_PARTS) return
  rows.value.push(row('', rest.value > 0 ? size(rest.value) : ''))
}
function drop(key: number) {
  rows.value = rows.value.filter(r => r.key !== key)
}
/** Puts what's left over into this part. */
function fill(r: Row) {
  r.amount = size((parseAmount(r.amount)?.cents ?? 0) + rest.value)
}

const usable = (id: string) => props.categories.some(c => c.id === id)
const action = useAction()
async function save() {
  const parts = rows.value.map(r => ({ category: r.category, amount: r.amount }))
  const checked = checkSplit(parts, t.value.amount_cents, usable)
  if ('problem' in checked) {
    action.error.value = checked.problem
    return
  }
  if (!await action.run(() => $fetch(`/api/transactions/${t.value.id}`, { method: 'PATCH', body: { splits: parts } }))) return
  emit('saved', `Split ${shownName(t.value)} across ${checked.ok.map(p => label(p.category)).join(', ')}.`)
}
async function undo() {
  if (!await action.run(() => $fetch(`/api/transactions/${t.value.id}`, { method: 'PATCH', body: { splits: [] } }))) return
  emit('saved', `${shownName(t.value)} isn't split now. It's all in ${label(t.value.category)} again.`)
}

const off = computed(() => leftOver(t.value))
</script>

<template>
  <form class="split" :aria-label="`Split ${shownName(t)}`" @submit.prevent="save">
    <p class="split-head">
      <span class="field-label">Split {{ formatCents(t.amount_cents) }} across categories</span>
    </p>
    <p v-if="off" class="notice fix" role="status">
      This split was made when it was {{ formatCents(t.amount_cents - off) }}. It's {{ formatCents(t.amount_cents) }} now, so {{ formatCents(off) }} counts in {{ label(t.category) }} until you fix the parts.
    </p>
    <ul class="parts">
      <li v-for="(r, i) in rows" :key="r.key" class="part">
        <label class="visually-hidden" :for="`part-cat-${t.id}-${r.key}`">Part {{ i + 1 }} category</label>
        <select :id="`part-cat-${t.id}-${r.key}`" v-model="r.category" class="input part-cat">
          <option value="" disabled>Category…</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <label class="visually-hidden" :for="`part-amt-${t.id}-${r.key}`">Part {{ i + 1 }} amount</label>
        <input :id="`part-amt-${t.id}-${r.key}`" v-model="r.amount" class="input num part-amt" inputmode="decimal" placeholder="0.00">
        <button v-if="rest !== 0" type="button" class="btn btn-plain small" :aria-label="`Put what's left in part ${i + 1}`" @click="fill(r)">Rest</button>
        <button v-if="rows.length > 2" type="button" class="btn btn-plain small" :aria-label="`Remove part ${i + 1}`" @click="drop(r.key)">Remove</button>
      </li>
    </ul>
    <p class="footnote" :class="{ ok: rest === 0 }" aria-live="polite">{{ status }}</p>
    <p v-if="action.error.value" class="notice notice-error" role="alert">{{ action.error.value }}</p>
    <div class="btn-row">
      <button class="btn btn-primary" :disabled="action.busy.value"><span v-if="action.busy.value" class="spinner" aria-hidden="true" /> Save split</button>
      <button v-if="rows.length < MAX_PARTS" type="button" class="btn btn-plain" @click="add">Add a part</button>
      <button type="button" class="btn btn-plain" @click="emit('cancel')">Cancel</button>
      <button v-if="t.splits.length" type="button" class="btn btn-plain danger push" :disabled="action.busy.value" @click="undo">Undo split</button>
    </div>
  </form>
</template>

<style scoped>
.split > * + * { margin-top: 0.5rem; }
.split-head { margin: 0; }
.parts { list-style: none; margin: 0; padding: 0; }
.part { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.part + .part { margin-top: 0.5rem; }
.part-cat { flex: 1 1 8rem; width: auto; min-width: 0; }
.part-amt { flex: 0 0 6.5rem; width: 6.5rem; }
.small { min-height: 2.75rem; padding: 0 0.5rem; font-size: 0.875rem; }
.ok { color: var(--text); }
.fix { background: color-mix(in srgb, var(--warning) 14%, var(--surface)); color: var(--text); }
.push { margin-left: auto; }
.danger { color: var(--critical); }
</style>
