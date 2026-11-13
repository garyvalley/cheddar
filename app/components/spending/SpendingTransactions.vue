<script setup lang="ts">
import { formatCents, type Transaction } from '~~/shared/accounts'
import { categoryOf, type Category } from '~~/shared/categories'
import { leftOver } from '~~/shared/splits'
import { DESCRIPTION_MAX, NOTE_MAX, PAYEE_MAX, checkEdit, shownName, type Direction } from '~~/shared/transactions'

// A list of transactions on Spending (a category's, every one, or a
// search's). Each can move to another category (the rest of that merchant's
// follow), and can be opened to give it a name of the person's own, a note,
// or to leave it out of the totals, or split across categories
// (SpendingSplit.vue). One added by hand can change entirely, or be deleted.

const props = defineProps<{
  items: Transaction[]
  categories: Category[]
  names: Map<string, string>
  /** Say which account each is in (the list spans several). */
  showAccount: boolean
  busy: boolean
  reviewMode?: boolean
}>()
// What changed, said once the page has the new totals (the list may no longer hold it).
const emit = defineEmits<{ changed: [message: string], reviewed: [ids: string[]] }>()
const selected = ref<string[]>([])
const allSelected = computed(() => props.items.length > 0 && props.items.every(t => selected.value.includes(t.id)))
function selectAll(event: Event) {
  selected.value = (event.target as HTMLInputElement).checked ? props.items.map(t => t.id) : []
}
function selectOne(id: string, event: Event) {
  selected.value = (event.target as HTMLInputElement).checked
    ? [...selected.value, id]
    : selected.value.filter(selectedId => selectedId !== id)
}

const NEW = '__new'
const label = (id: string) => categoryOf(id, props.categories).label
const builtInSpending = computed(() => props.categories.filter(c => !c.custom && c.spending))
const yours = computed(() => props.categories.filter(c => c.custom && !c.shared))
const notSpent = computed(() => props.categories.filter(c => !c.spending))

const today = useToday()
const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short', day: 'numeric', ...(ymd.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
})
const origin = (t: Transaction) => (t.source === 'manual' ? 'Added by hand' : '')

// Moving one to another category, maybe a new one of the person's own.
const move = useAction()
const naming = ref('') // the transaction a new category is being named for
const newName = ref('')
async function recategorize(t: Transaction, to: string) {
  if (to === categoryOf(t.category, props.categories).id) return
  const r = await move.run(() => $fetch<{ moved: number }>(`/api/transactions/${t.id}/category`, { method: 'POST', body: { category: to } }))
  if (!r) return
  const others = r.moved === 1 ? ' 1 more from the same place moved too.' : r.moved > 1 ? ` ${r.moved} more from the same place moved too.` : ''
  emit('changed', `${shownName(t)} is now in ${label(to)}.${others} New ones from there will go to ${label(to)} as well.`)
}
function picked(t: Transaction, event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value !== NEW) return recategorize(t, select.value)
  select.value = categoryOf(t.category, props.categories).id
  naming.value = t.id
  newName.value = ''
}
async function createFor(t: Transaction) {
  const r = await move.run(() => $fetch<{ category: Category }>('/api/categories', { method: 'POST', body: { name: newName.value } }))
  if (!r) return
  await refreshNuxtData('categories')
  naming.value = ''
  await recategorize(t, r.category.id)
}

// Changing one: its name, a note, leaving it out; all of it for one added by hand.
const edit = useAction()
const editing = ref('')
const deleting = ref(false)
const form = reactive({ payee: '', note: '', excluded: false, posted: '', amount: '', direction: 'out' as Direction, description: '' })
function open(t: Transaction) {
  splitting.value = ''
  edit.error.value = ''
  deleting.value = false
  Object.assign(form, {
    payee: t.payee, note: t.note, excluded: t.excluded, posted: t.posted,
    amount: (Math.abs(t.amount_cents) / 100).toFixed(2), direction: t.amount_cents > 0 ? 'in' : 'out', description: t.description,
  })
  editing.value = editing.value === t.id ? '' : t.id
}
async function save(t: Transaction) {
  const manual = t.source === 'manual' && !t.shared
  const change: Record<string, unknown> = { payee: form.payee, note: form.note, excluded: form.excluded }
  if (manual) Object.assign(change, { posted: form.posted, amount: form.amount, direction: form.direction, description: form.description })
  const checked = checkEdit(change, manual)
  if ('problem' in checked) {
    edit.error.value = checked.problem
    return
  }
  if (!await edit.run(() => $fetch(`/api/transactions/${t.id}`, { method: 'PATCH', body: change }))) return
  editing.value = ''
  const name = shownName({ payee: form.payee, description: form.description })
  emit('changed', form.excluded && !t.excluded
    ? `${name} is left out of spending and taxes now. It stays listed here.`
    : !form.excluded && t.excluded ? `${name} counts again.` : `Saved ${name}.`)
}
// Splitting one across categories: in place of the form, from it or from the row's chip.
const splitting = ref('')
function split(t: Transaction) {
  editing.value = ''
  splitting.value = splitting.value === t.id ? '' : t.id
}
function splitSaved(message: string) {
  splitting.value = ''
  emit('changed', message)
}
const partsText = (t: Transaction) => t.splits.map(p => `${label(p.category)} ${formatCents(p.amount_cents)}`).join(' · ')

async function remove(t: Transaction) {
  if (!await edit.succeed(() => $fetch(`/api/transactions/${t.id}`, { method: 'DELETE' }))) return
  editing.value = ''
  emit('changed', `Deleted ${shownName(t)}.`)
}
watch(() => props.items, () => {
  naming.value = ''
  if (!props.items.some(t => t.id === editing.value)) editing.value = ''
  if (!props.items.some(t => t.id === splitting.value)) splitting.value = ''
})
</script>

<template>
  <div>
    <p v-if="move.error.value" class="notice notice-error gap" role="alert">{{ move.error.value }}</p>
    <div v-if="reviewMode" class="review-tools">
      <label class="check"><input type="checkbox" :checked="allSelected" @change="selectAll"><span>Select all on this page</span></label>
      <button class="btn btn-primary" :disabled="!selected.length || busy" @click="emit('reviewed', selected)">Mark {{ selected.length || '' }} reviewed</button>
    </div>
    <ul class="card list" :aria-busy="busy || move.busy.value || edit.busy.value">
      <li v-for="t in items" :key="t.id" class="tx-item" :class="{ out: t.excluded }">
        <div class="row tx">
          <input v-if="reviewMode" type="checkbox" class="review-check" :checked="selected.includes(t.id)" :aria-label="`Select ${shownName(t)}`" @change="selectOne(t.id, $event)">
          <button class="row-label opener" :aria-expanded="editing === t.id" :aria-label="`Change ${shownName(t)}, ${day(t.posted)}`" @click="open(t)">
            <span class="block desc">{{ shownName(t) }}</span>
            <span v-if="t.payee && t.description && t.payee !== t.description" class="footnote block desc">{{ t.description }}</span>
            <span class="footnote">{{ day(t.posted) }}<template v-if="showAccount"> · {{ names.get(t.account) }}</template><template v-if="t.pending"> · Pending</template><template v-if="origin(t)"> · {{ origin(t) }}</template></span>
            <span v-if="t.splits.length && t.shared" class="footnote block parts">Split details belong to the account owner.</span>
            <span v-else-if="t.splits.length" class="footnote block parts">{{ partsText(t) }}</span>
            <span v-if="leftOver(t)" class="badge badge-warn">Split needs fixing</span>
            <span v-if="t.excluded" class="badge badge-off">Left out</span>
            <span v-if="t.note" class="footnote block note">{{ t.note }}</span>
          </button>
          <span class="tx-side">
            <span class="num amount" :class="moneyTone(t.amount_cents)">{{ formatCents(t.amount_cents) }}</span>
            <span v-if="t.shared" class="chip" :title="t.splits.length ? 'Split details belong to the account owner' : 'Categories are managed by the account owner'">{{ t.splits.length ? `Split · ${t.splits.length}` : label(t.category) }}</span>
            <button
              v-else-if="t.splits.length" type="button" class="chip" :aria-expanded="splitting === t.id"
              :aria-label="`Split of ${shownName(t)}: ${partsText(t)}. Change it`" @click="split(t)"
            >
              Split · {{ t.splits.length }}
            </button>
            <select
              v-else
              class="chip" :value="categoryOf(t.category, categories).id" :disabled="move.busy.value"
              :aria-label="`Category for ${shownName(t)}`"
              @change="picked(t, $event)"
            >
              <optgroup label="Spending">
                <option v-for="c in builtInSpending" :key="c.id" :value="c.id">{{ c.label }}</option>
              </optgroup>
              <optgroup v-if="yours.length" label="Your categories">
                <option v-for="c in yours" :key="c.id" :value="c.id">{{ c.label }}</option>
              </optgroup>
              <optgroup label="Not spending">
                <option v-for="c in notSpent" :key="c.id" :value="c.id">{{ c.label }}</option>
              </optgroup>
              <option :value="NEW">New category…</option>
            </select>
          </span>
        </div>
        <form v-if="naming === t.id" class="inline-form panel" @submit.prevent="createFor(t)">
          <label class="visually-hidden" :for="`new-${t.id}`">Name for the new category</label>
          <input :id="`new-${t.id}`" v-model="newName" class="input" maxlength="40" placeholder="New category's name" required>
          <button class="btn btn-primary" :disabled="move.busy.value"><span v-if="move.busy.value" class="spinner" aria-hidden="true" /> Add</button>
          <button type="button" class="btn btn-plain" @click="naming = ''">Cancel</button>
        </form>
        <SpendingSplit v-if="splitting === t.id" class="panel" :transaction="t" :categories="categories" @saved="splitSaved" @cancel="splitting = ''" />
        <form v-if="editing === t.id" class="panel edit" @submit.prevent="save(t)">
          <template v-if="t.source === 'manual' && !t.shared">
            <label class="field">
              <span class="field-label">What it was</span>
              <input v-model="form.description" class="input" :maxlength="DESCRIPTION_MAX" required>
            </label>
            <div class="pair">
              <label class="field">
                <span class="field-label">Day</span>
                <input v-model="form.posted" class="input" type="date" required>
              </label>
              <label class="field">
                <span class="field-label">Amount</span>
                <input v-model="form.amount" class="input num" inputmode="decimal" required>
              </label>
            </div>
            <div class="segmented field" role="group" aria-label="Money out or in">
              <button type="button" class="seg" :aria-pressed="form.direction === 'out'" @click="form.direction = 'out'">Money out</button>
              <button type="button" class="seg" :aria-pressed="form.direction === 'in'" @click="form.direction = 'in'">Money in</button>
            </div>
          </template>
          <label class="field">
            <span class="field-label">Name (optional)</span>
            <input v-model="form.payee" class="input" :maxlength="PAYEE_MAX" :placeholder="t.description || 'A name of your own'">
          </label>
          <label class="field">
            <span class="field-label">Note (optional)</span>
            <textarea v-model="form.note" class="input note-input" :maxlength="NOTE_MAX" rows="2" />
          </label>
          <label class="check">
            <input v-model="form.excluded" type="checkbox">
            <span>Leave out of spending, Overview, Projections and Taxes</span>
          </label>
          <p class="footnote">
            <template v-if="t.shared">Shared by another household member. You can change its name, note, or whether it counts.</template>
            <template v-else-if="t.source === 'manual'">You added this one by hand.</template>
            <template v-else>Its date, amount and description are what your {{ t.source === 'sync' ? 'bank sent' : 'statement says' }}. A name you give it groups it with that merchant.</template>
          </p>
          <p v-if="edit.error.value" class="notice notice-error" role="alert">{{ edit.error.value }}</p>
          <div v-if="deleting" class="inline-form">
            <span class="footnote grow">Delete {{ shownName(t) }}? This can't be undone.</span>
            <button type="button" class="btn btn-plain" @click="deleting = false">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="edit.busy.value" @click="remove(t)"><span v-if="edit.busy.value" class="spinner" aria-hidden="true" /> Delete</button>
          </div>
          <div v-else class="btn-row">
            <button class="btn btn-primary" :disabled="edit.busy.value"><span v-if="edit.busy.value" class="spinner" aria-hidden="true" /> Save</button>
            <button type="button" class="btn btn-plain" @click="editing = ''">Cancel</button>
            <button v-if="!t.shared" type="button" class="btn btn-plain" @click="split(t)">{{ t.splits.length ? 'Change the split…' : 'Split…' }}</button>
            <button v-if="t.source === 'manual' && !t.shared" type="button" class="btn btn-plain danger push" @click="deleting = true">Delete…</button>
          </div>
        </form>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.gap { margin-bottom: 0.75rem; }
.desc { overflow-wrap: anywhere; }
.amount { white-space: nowrap; }
.tx { align-items: flex-start; }
.review-tools { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.review-tools .check { display: flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; }
.review-check { width: 1.25rem; height: 1.25rem; flex: none; accent-color: var(--accent); margin: 0; }
.opener {
  display: block; min-width: 0; padding: 0; border: 0; background: none;
  font: inherit; color: inherit; text-align: left; cursor: pointer;
}
.opener:hover .desc:first-child { text-decoration: underline; }
.opener .badge { margin-left: 0; margin-top: 0.25rem; display: inline-block; }
.parts { color: var(--text-2); margin-top: 0.125rem; }
.badge-warn { background: color-mix(in srgb, var(--warning) 16%, var(--surface)); color: var(--warning); }
.note { color: var(--text-2); font-style: italic; white-space: pre-line; margin-top: 0.125rem; }
.out .amount { opacity: 0.55; text-decoration: line-through; }
.tx-side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
.chip {
  max-width: 11rem; min-height: 2.25rem; padding: 0.25rem 0.5rem;
  font: inherit; font-size: 0.8125rem; color: var(--accent);
  background: var(--accent-soft); border: 1px solid transparent; border-radius: 999px; cursor: pointer;
}
.chip:focus-visible { border-color: var(--focus); }
.panel { margin: 0; padding: 0 1rem 0.875rem; }
.edit > * + * { margin-top: 0.5rem; }
.edit .field { padding: 0; border-top: 0; }
.pair { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.pair > .field { flex: 1 1 9rem; margin: 0; }
.note-input { resize: vertical; min-height: 2.75rem; }
.check { display: flex; gap: 0.75rem; align-items: center; min-height: 2.75rem; }
.check input { width: 1.25rem; height: 1.25rem; flex: none; accent-color: var(--accent); }
.inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.inline-form .input { flex: 1 1 12rem; width: auto; }
.grow { flex: 1 1 12rem; }
.push { margin-left: auto; }
.danger { color: var(--critical); }
</style>
