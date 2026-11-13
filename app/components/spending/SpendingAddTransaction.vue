<script setup lang="ts">
import type { Account } from '~~/shared/accounts'
import { DESCRIPTION_MAX, NOTE_MAX, checkManual, type Direction } from '~~/shared/transactions'

// Adding a transaction by hand on Spending: a cash purchase, or one a
// statement missed. Only into an account no bank link keeps, since a link
// brings its own and one typed in too would count twice. The page's own
// "Add a transaction" button opens it (v-model:open).

const props = defineProps<{ accounts: Account[], account: string }>()
const emit = defineEmits<{ added: [message: string] }>()
const adding = defineModel<boolean>('open', { default: false })

const unlinked = computed(() => props.accounts.filter(a => !a.linked))
const today = useToday()
const add = useAction()
const blank = () => ({
  account: unlinked.value.some(a => a.id === props.account) ? props.account : unlinked.value[0]?.id ?? '',
  posted: today, amount: '', direction: 'out' as Direction, description: '', note: '',
})
const form = reactive(blank())
watch(adding, (open) => {
  if (!open) return
  Object.assign(form, blank())
  add.error.value = ''
}, { immediate: true })

async function save() {
  const checked = checkManual(form)
  if ('problem' in checked) {
    add.error.value = checked.problem
    return
  }
  if (!await add.run(() => $fetch('/api/transactions', { method: 'POST', body: { ...form } }))) return
  adding.value = false
  const name = props.accounts.find(a => a.id === form.account)?.name ?? 'the account'
  emit('added', `Added ${checked.ok.description} to ${name}.`)
}
</script>

<template>
  <section v-if="adding" class="group" aria-labelledby="add-title">
    <form class="card" @submit.prevent="save">
      <div class="panel-head">
        <h2 id="add-title" class="panel-title">Add a transaction</h2>
      </div>
      <label class="field">
        <span class="field-label">Account</span>
        <select v-model="form.account" class="select" required>
          <option v-for="a in unlinked" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">What it was</span>
        <input v-model="form.description" v-focus class="input" :maxlength="DESCRIPTION_MAX" placeholder="Farmers market" required>
      </label>
      <div class="field pair">
        <label>
          <span class="field-label">Day</span>
          <input v-model="form.posted" class="input" type="date" :max="today" required>
        </label>
        <label>
          <span class="field-label">Amount</span>
          <input v-model="form.amount" class="input num" inputmode="decimal" placeholder="0.00" required>
        </label>
      </div>
      <div class="field">
        <div class="segmented" role="group" aria-label="Money out or in">
          <button type="button" class="seg" :aria-pressed="form.direction === 'out'" @click="form.direction = 'out'">Money out</button>
          <button type="button" class="seg" :aria-pressed="form.direction === 'in'" @click="form.direction = 'in'">Money in</button>
        </div>
      </div>
      <label class="field">
        <span class="field-label">Note (optional)</span>
        <textarea v-model="form.note" class="input note-input" :maxlength="NOTE_MAX" rows="2" />
      </label>
      <p v-if="add.error.value" class="field notice notice-error" role="alert">{{ add.error.value }}</p>
      <div class="field btn-row">
        <button class="btn btn-primary" :disabled="add.busy.value"><span v-if="add.busy.value" class="spinner" aria-hidden="true" /> Add transaction</button>
        <button type="button" class="btn btn-plain" @click="adding = false">Cancel</button>
      </div>
    </form>
    <p class="group-footer">For cash, or something a statement missed. Cheddar sorts it into a category like any other.</p>
  </section>
</template>

<style scoped>
.pair { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.pair > label { flex: 1 1 9rem; min-width: 0; }
.note-input { resize: vertical; min-height: 2.75rem; }
</style>
