<script setup lang="ts">
import { formatCents, isLiability, type Account, type Import } from '~~/shared/accounts'
import { MATCH_DAYS } from '~~/shared/overlap'
import { MAX_FILE_BYTES, dateRange, readStatement, type CsvMapping, type Statement } from '~~/shared/statements'

useHead({ title: 'Import a statement' })
const route = useRoute()

const { data: list } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const accounts = computed(() => list.value.accounts)
const accountId = ref(typeof route.query.account === 'string' ? route.query.account : '')
watch(accounts, (all) => {
  if (!all.some(a => a.id === accountId.value)) accountId.value = all[0]?.id ?? ''
}, { immediate: true })
const account = computed(() => accounts.value.find(a => a.id === accountId.value))

const { data: history, refresh: refreshHistory } = await useFetch<{ imports: Import[] }>('/api/imports', {
  query: { account: accountId }, default: () => ({ imports: [] }),
})

// The chosen file, read in the browser for the preview. The server reads it again.
const file = ref<{ name: string, text: string } | null>(null)
const fileProblem = ref('')
const mapping = ref<CsvMapping | undefined>()
const flipNote = ref(false)
const result = ref<{ import: Import, unreadable: number } | null>(null)
const input = ref<HTMLInputElement>()

const statement = computed<Statement | { problem: string } | null>(() =>
  file.value ? readStatement(file.value.name, file.value.text, mapping.value) : null)
const read = computed(() => (statement.value && !('problem' in statement.value) ? statement.value : null))
const range = computed(() => (read.value ? dateRange(read.value.rows) : null))
const totals = computed(() => {
  let out = 0
  let into = 0
  for (const r of read.value?.rows ?? []) {
    if (r.amount_cents < 0) out += r.amount_cents
    else into += r.amount_cents
  }
  return { out, into }
})

async function choose(event: Event) {
  const chosen = (event.target as HTMLInputElement).files?.[0]
  result.value = null
  file.value = null
  mapping.value = undefined
  flipNote.value = false
  fileProblem.value = ''
  if (!chosen) return
  if (chosen.size > MAX_FILE_BYTES) {
    fileProblem.value = 'The file is too large (4 MB at most). Export a shorter date range.'
    return
  }
  file.value = { name: chosen.name, text: await chosen.text() }
  // A card's export that shows charges as positive: most rows would be money in.
  const first = statement.value
  if (first && !('problem' in first) && first.mapping && account.value && isLiability(account.value.kind)) {
    const positive = first.rows.filter(r => r.amount_cents > 0).length
    if (positive > first.rows.length / 2) {
      mapping.value = { ...first.mapping, flip: true }
      flipNote.value = true
    }
  }
}

// Editing a column starts from the columns in use.
function setMapping(change: Partial<CsvMapping>) {
  if (!read.value?.mapping) return
  mapping.value = { ...read.value.mapping, ...change }
}
const columnChoice = (key: 'date' | 'description' | 'amount' | 'debit' | 'credit') => ({
  get: () => read.value?.mapping?.[key] ?? -1,
  set: (v: number) => setMapping({ [key]: v }),
})
const dateCol = computed(columnChoice('date'))
const descCol = computed(columnChoice('description'))
const amountCol = computed(columnChoice('amount'))
const debitCol = computed(columnChoice('debit'))
const creditCol = computed(columnChoice('credit'))
const dateOrder = computed({ get: () => read.value?.mapping?.dateOrder ?? 'mdy', set: v => setMapping({ dateOrder: v }) })
const flip = computed({ get: () => read.value?.mapping?.flip ?? false, set: v => setMapping({ flip: v }) })

const send = useAction()
async function importFile() {
  if (!file.value || !account.value) return
  const r = await send.run(() => $fetch<{ import: Import, unreadable: number }>('/api/imports', {
    method: 'POST',
    body: { account: account.value!.id, filename: file.value!.name, text: file.value!.text, mapping: read.value?.format === 'csv' ? read.value.mapping : undefined },
  }))
  if (!r) return
  result.value = r
  file.value = null
  if (input.value) input.value.value = ''
  await refreshHistory()
}

const undo = useAction()
const undoing = ref('')
async function undoImport(id: string) {
  undoing.value = id
  if (await undo.succeed(() => $fetch(`/api/imports/${id}`, { method: 'DELETE' }))) {
    if (result.value?.import.id === id) result.value = null
    await refreshHistory()
  }
  undoing.value = ''
}

const when = (iso: string) => new Date(iso.replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
</script>

<template>
  <div>
    <AppHeader title="Import" />

    <section v-if="!accounts.length" class="group">
      <div class="card card-pad stack">
        <p>Add the account the statement belongs to first.</p>
        <NuxtLink to="/accounts" class="btn btn-primary">Add an account</NuxtLink>
      </div>
    </section>

    <template v-else>
      <section class="group" aria-labelledby="file-title">
        <h2 id="file-title" class="group-title">Statement file</h2>
        <div class="card">
          <label class="field">
            <span class="field-label">Account</span>
            <select v-model="accountId" class="select" @change="result = null">
              <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}{{ a.last4 ? ` ••${a.last4}` : '' }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">CSV, OFX or QFX file</span>
            <input ref="input" type="file" class="input file" accept=".csv,.txt,.ofx,.qfx,.qbo,text/csv" @change="choose">
          </label>
        </div>
        <p class="group-footer">
          On your bank's website, look for Download or Export next to your transactions. Choose CSV, or Quicken (QFX) or Money (OFX). Transactions already in the account are skipped, so overlapping dates are fine.
          <template v-if="account?.linked">
            {{ account.name }} is linked to your bank, so a transaction the link already brought in, with the same amount within {{ MATCH_DAYS }} days, is skipped too.
          </template>
        </p>
      </section>

      <p v-if="fileProblem" class="notice notice-error" role="alert">{{ fileProblem }}</p>
      <p v-else-if="statement && 'problem' in statement" class="notice notice-error" role="alert">{{ statement.problem }}</p>

      <section v-if="result" class="group" aria-live="polite">
        <div class="notice notice-success stack" role="status">
          <p>
            Imported {{ plural(result.import.added, 'transaction') }} into {{ account?.name }}.
            <template v-if="result.import.skipped">{{ plural(result.import.skipped, 'was', 'were') }} already there.</template>
            <template v-if="result.unreadable">{{ plural(result.unreadable, 'line') }} couldn't be read.</template>
          </p>
          <p class="btn-row">
            <NuxtLink :to="{ path: '/spending', query: { account: accountId } }" class="btn btn-tinted">See transactions</NuxtLink>
          </p>
        </div>
      </section>

      <template v-if="read">
        <section v-if="read.format === 'csv' && read.columns" class="group" aria-labelledby="columns-title">
          <h2 id="columns-title" class="group-title">Columns</h2>
          <div class="card">
            <label class="field">
              <span class="field-label">Date</span>
              <select v-model.number="dateCol" class="select">
                <option v-for="(c, i) in read.columns" :key="i" :value="i">{{ c || `Column ${i + 1}` }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Description</span>
              <select v-model.number="descCol" class="select">
                <option :value="-1">None</option>
                <option v-for="(c, i) in read.columns" :key="i" :value="i">{{ c || `Column ${i + 1}` }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Amount</span>
              <select v-model.number="amountCol" class="select">
                <option :value="-1">Separate money out and money in columns</option>
                <option v-for="(c, i) in read.columns" :key="i" :value="i">{{ c || `Column ${i + 1}` }}</option>
              </select>
            </label>
            <template v-if="amountCol < 0">
              <label class="field">
                <span class="field-label">Money out</span>
                <select v-model.number="debitCol" class="select">
                  <option :value="-1">None</option>
                  <option v-for="(c, i) in read.columns" :key="i" :value="i">{{ c || `Column ${i + 1}` }}</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">Money in</span>
                <select v-model.number="creditCol" class="select">
                  <option :value="-1">None</option>
                  <option v-for="(c, i) in read.columns" :key="i" :value="i">{{ c || `Column ${i + 1}` }}</option>
                </select>
              </label>
            </template>
            <label class="field">
              <span class="field-label">Dates are written</span>
              <select v-model="dateOrder" class="select">
                <option value="mdy">Month first (03/31/2026)</option>
                <option value="dmy">Day first (31/03/2026)</option>
              </select>
            </label>
            <label class="field check">
              <input v-model="flip" type="checkbox">
              <span>Money out shows as positive in this file</span>
            </label>
          </div>
          <p v-if="flipNote" class="group-footer">Most amounts in this card's file are positive, so they're read as charges. Untick this if that's wrong.</p>
        </section>

        <section class="group" aria-labelledby="preview-title">
          <h2 id="preview-title" class="group-title">Preview</h2>
          <div class="card card-pad stack">
            <p v-if="range">
              <strong>{{ plural(read.rows.length, 'transaction') }}</strong>,
              {{ day(range.first) }} to {{ day(range.last) }}.
              <span class="muted">Out <span class="num">{{ formatCents(totals.out) }}</span>, in <span class="num">{{ formatCents(totals.into) }}</span>.</span>
            </p>
            <p v-else>No transactions could be read. Check the columns above.</p>
            <div v-if="read.problems.length" class="notice notice-info">
              {{ plural(read.problems.length, 'line') }} won't be imported:
              <span v-for="(p, i) in read.problems.slice(0, 3)" :key="p.line">{{ i ? '; ' : ' ' }}line {{ p.line }}, {{ p.problem }}</span>{{ read.problems.length > 3 ? '…' : '.' }}
            </div>
            <div class="scroll">
              <table class="preview">
                <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col" class="amt">Amount</th></tr></thead>
                <tbody>
                  <tr v-for="(r, i) in read.rows.slice(0, 20)" :key="i">
                    <td class="num nowrap">{{ r.posted }}</td>
                    <td>{{ r.description }}</td>
                    <td class="num amt" :class="moneyTone(r.amount_cents)">{{ formatCents(r.amount_cents) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="read.rows.length > 20" class="footnote">And {{ plural(read.rows.length - 20, 'more', 'more') }}.</p>
            <div class="btn-row">
              <button class="btn btn-primary" :disabled="send.busy.value || !read.rows.length" @click="importFile">
                <span v-if="send.busy.value" class="spinner" aria-hidden="true" /> Import {{ plural(read.rows.length, 'transaction') }}
              </button>
            </div>
            <p v-if="send.error.value" class="notice notice-error" role="alert">{{ send.error.value }}</p>
          </div>
        </section>
      </template>

      <section v-if="history.imports.length" class="group" aria-labelledby="history-title">
        <h2 id="history-title" class="group-title">Imported into {{ account?.name }}</h2>
        <ul class="card list">
          <li v-for="i in history.imports" :key="i.id" class="row">
            <span class="row-label">
              <span class="block name">{{ i.filename || 'Statement' }}</span>
              <span class="footnote">
                {{ when(i.created) }} · {{ plural(i.added, 'added', 'added') }}<template v-if="i.skipped">, {{ i.skipped }} already there</template>
                <template v-if="i.first_date"> · {{ day(i.first_date) }} to {{ day(i.last_date) }}</template>
              </span>
            </span>
            <button class="btn btn-plain" :disabled="undo.busy.value" :aria-label="`Undo the import of ${i.filename}`" @click="undoImport(i.id)">
              <span v-if="undoing === i.id" class="spinner" aria-hidden="true" /> Undo
            </button>
          </li>
        </ul>
        <p v-if="undo.error.value" class="notice notice-error" role="alert">{{ undo.error.value }}</p>
        <p class="group-footer">Undo removes the transactions that import added.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.file { padding: 0.5rem; }
.check { display: flex; gap: 0.75rem; align-items: center; min-height: 2.75rem; }
.check input { width: 1.25rem; height: 1.25rem; accent-color: var(--accent); }
.scroll { overflow-x: auto; margin-inline: -1rem; padding-inline: 1rem; }
.preview { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
.preview th { text-align: left; font-weight: 400; font-size: 0.8125rem; color: var(--text-2); padding: 0 0.5rem 0.375rem 0; }
.preview td { padding: 0.375rem 0.5rem 0.375rem 0; border-top: 0.5px solid var(--separator); vertical-align: top; }
.amt { text-align: right; white-space: nowrap; padding-right: 0 !important; }
.nowrap { white-space: nowrap; }
.name { overflow-wrap: anywhere; }
</style>
