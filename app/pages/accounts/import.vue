<script setup lang="ts">
import { formatCents, isLiability, type Account, type Import } from '~~/shared/accounts'
import { MATCH_DAYS } from '~~/shared/overlap'
import { MAX_FILE_BYTES, dateRange, readStatement, type CsvMapping } from '~~/shared/statements'

useHead({ title: 'Import statements' })
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

// The chosen files, read in the browser for the preview. The server reads each again.
interface Chosen {
  name: string
  text: string
  /** A CSV's columns, when not the ones its headings suggest. */
  mapping?: CsvMapping
  /** A card's CSV was flipped because most of its amounts were positive. */
  flipNote: boolean
}
const files = ref<Chosen[]>([])
const fileProblems = ref<string[]>([])
// A PDF's text is read in the browser first, which takes a moment for a long one.
const reading = ref(false)
const pdfFlip = ref(false)
interface Result { name: string, import?: Import, unreadable?: number, balance?: { cents: number, date: string } | null, error?: string }
const results = ref<Result[]>([])
const input = ref<HTMLInputElement>()

const liability = computed(() => !!account.value && isLiability(account.value.kind))
const readFile = (f: Chosen) => readStatement(f.name, f.text, f.mapping, { liability: liability.value, flip: pdfFlip.value })
const statements = computed(() => files.value.map(f => ({ file: f, statement: readFile(f) })))
const readable = computed(() => statements.value.flatMap(x => ('problem' in x.statement ? [] : [{ file: x.file, read: x.statement }])))
const unreadable = computed(() => statements.value.flatMap(x => ('problem' in x.statement ? [{ name: x.file.name, problem: x.statement.problem }] : [])))
const several = computed(() => files.value.length > 1)
/** The one file's statement, when only one was chosen: its columns can be changed. */
const read = computed(() => (several.value ? null : readable.value[0]?.read ?? null))
const rows = computed(() => readable.value.flatMap(x => x.read.rows))
const problems = computed(() => readable.value.flatMap(x => x.read.problems.map(p => ({ ...p, name: x.file.name }))))
const anyPdf = computed(() => readable.value.some(x => x.read.format === 'pdf'))
const flipNote = computed(() => files.value.some(f => f.flipNote))
const range = computed(() => dateRange(rows.value))
/** The newest balance the files print: what the account will hold once they're imported. */
const closing = computed(() => readable.value.reduce<{ cents: number, date: string } | null>((best, x) => (x.read.closing && (!best || x.read.closing.date >= best.date) ? x.read.closing : best), null))
const totals = computed(() => {
  let out = 0
  let into = 0
  for (const r of rows.value) {
    if (r.amount_cents < 0) out += r.amount_cents
    else into += r.amount_cents
  }
  return { out, into }
})

/** One chosen file read for the preview, or why it can't be. */
async function take(chosen: File): Promise<Chosen | string> {
  const pdf = /\.pdf$/i.test(chosen.name) || chosen.type === 'application/pdf'
  if (chosen.size > (pdf ? MAX_PDF_BYTES : MAX_FILE_BYTES)) {
    return pdf ? 'The PDF is too large (20 MB at most).' : 'The file is too large (4 MB at most). Export a shorter date range.'
  }
  if (pdf) {
    try {
      const text = await textOfPdf(chosen)
      if (new Blob([text]).size > MAX_FILE_BYTES) return 'This PDF holds too much text to be one statement. Choose a single month\'s statement.'
      return { name: chosen.name, text, flipNote: false }
    }
    catch (error) {
      return error instanceof Error && error.message ? error.message : 'This file couldn\'t be opened as a PDF.'
    }
  }
  const f: Chosen = { name: chosen.name, text: await chosen.text(), flipNote: false }
  // A card's export that shows charges as positive: most rows would be money in.
  const first = readFile(f)
  if (!('problem' in first) && first.mapping && liability.value) {
    const positive = first.rows.filter(r => r.amount_cents > 0).length
    if (positive > first.rows.length / 2) {
      f.mapping = { ...first.mapping, flip: true }
      f.flipNote = true
    }
  }
  return f
}

async function choose(event: Event) {
  const chosen = [...((event.target as HTMLInputElement).files ?? [])]
  results.value = []
  files.value = []
  fileProblems.value = []
  pdfFlip.value = false
  if (!chosen.length) return
  reading.value = chosen.some(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
  const taken: Chosen[] = []
  const problems: string[] = []
  try {
    for (const f of chosen) {
      const t = await take(f)
      if (typeof t === 'string') problems.push(chosen.length > 1 ? `${f.name}: ${t}` : t)
      else taken.push(t)
    }
  }
  finally {
    reading.value = false
  }
  files.value = taken
  fileProblems.value = problems
}

// Editing a column starts from the columns in use; only with one file chosen.
function setMapping(change: Partial<CsvMapping>) {
  const f = files.value[0]
  if (several.value || !f || !read.value?.mapping) return
  f.mapping = { ...read.value.mapping, ...change }
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

// Each file is its own import, so each can be undone on its own. One that
// fails doesn't stop the rest.
const sending = ref(false)
async function importFiles() {
  if (!readable.value.length || !account.value) return
  sending.value = true
  const done: Result[] = []
  try {
    // Oldest first, so each statement's closing balance joins the account's history in turn.
    const order = [...readable.value].sort((a, b) => (a.read.closing?.date ?? dateRange(a.read.rows)?.last ?? '').localeCompare(b.read.closing?.date ?? dateRange(b.read.rows)?.last ?? ''))
    for (const { file: f, read: r } of order) {
      try {
        const answer = await $fetch<{ import: Import, unreadable: number, balance: { cents: number, date: string } | null }>('/api/imports', {
          method: 'POST',
          body: {
            account: account.value.id, filename: f.name, text: f.text,
            mapping: r.format === 'csv' ? r.mapping : undefined,
            flip: r.format === 'pdf' ? pdfFlip.value : undefined,
          },
        })
        done.push({ name: f.name, ...answer })
      }
      catch (error) {
        done.push({ name: f.name, error: errorMessage(error) })
      }
    }
  }
  finally {
    sending.value = false
  }
  results.value = done
  // What didn't import stays chosen, to try again.
  const failed = new Set(done.filter(d => d.error).map(d => d.name))
  files.value = files.value.filter(f => failed.has(f.name))
  if (!files.value.length && input.value) input.value.value = ''
  await refreshHistory()
}
const imported = computed(() => results.value.filter(r => r.import))
const added = computed(() => imported.value.reduce((n, r) => n + r.import!.added, 0))
const skipped = computed(() => imported.value.reduce((n, r) => n + r.import!.skipped, 0))
const unreadLines = computed(() => imported.value.reduce((n, r) => n + (r.unreadable ?? 0), 0))
const failures = computed(() => results.value.filter(r => r.error))
const newBalance = computed(() => imported.value.reduce<{ cents: number, date: string } | null>((best, r) => (r.balance && (!best || r.balance.date >= best.date) ? r.balance : best), null))

const undo = useAction()
const undoing = ref('')
async function undoImport(id: string) {
  undoing.value = id
  if (await undo.succeed(() => $fetch(`/api/imports/${id}`, { method: 'DELETE' }))) {
    results.value = results.value.filter(r => r.import?.id !== id)
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
        <h2 id="file-title" class="group-title">Statement files</h2>
        <div class="card">
          <label class="field">
            <span class="field-label">Account</span>
            <select v-model="accountId" class="select" @change="results = []">
              <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}{{ a.last4 ? ` ••${a.last4}` : '' }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">PDF statements, or CSV, OFX or QFX files</span>
            <input ref="input" type="file" multiple class="input file" accept=".pdf,.csv,.txt,.ofx,.qfx,.qbo,application/pdf,text/csv" @change="choose">
          </label>
        </div>
        <p class="group-footer">
          Choose one file or several, such as a year of monthly statements. The PDF statement your bank sends each month works, as long as it isn't a scan. A download works too: on your bank's website, look for Download or Export next to your transactions, and choose CSV, or Quicken (QFX) or Money (OFX). Transactions already in the account are skipped, so overlapping dates are fine.
          <template v-if="account?.linked">
            {{ account.name }} is linked to your bank, so a transaction the link already brought in, with the same amount within {{ MATCH_DAYS }} days, is skipped too.
          </template>
        </p>
      </section>

      <p v-if="reading" class="notice notice-info" role="status"><span class="spinner" aria-hidden="true" /> Reading…</p>
      <p v-for="(p, i) in fileProblems" :key="`f${i}`" class="notice notice-error" role="alert">{{ p }}</p>
      <p v-for="(u, i) in unreadable" :key="`u${i}`" class="notice notice-error" role="alert">{{ several ? `${u.name}: ` : '' }}{{ u.problem }}</p>

      <section v-if="results.length" class="group" aria-live="polite">
        <p v-for="(f, i) in failures" :key="`e${i}`" class="notice notice-error" role="alert">{{ f.name }} wasn't imported: {{ f.error }}</p>
        <div v-if="imported.length" class="notice notice-success stack" role="status">
          <p>
            Imported {{ plural(added, 'transaction') }} into {{ account?.name }}<template v-if="imported.length > 1"> from {{ imported.length }} files</template>.
            <template v-if="skipped">{{ plural(skipped, 'was', 'were') }} already there.</template>
            <template v-if="unreadLines">{{ plural(unreadLines, 'line') }} couldn't be read.</template>
          </p>
          <p v-if="newBalance">{{ account?.name }}'s balance is now <span class="num">{{ formatCents(newBalance.cents) }}</span>, as of {{ day(newBalance.date) }}.</p>
          <p class="btn-row">
            <NuxtLink :to="{ path: '/spending', query: { account: accountId } }" class="btn btn-tinted">See transactions</NuxtLink>
          </p>
        </div>
      </section>

      <template v-if="readable.length">
        <section v-if="read && read.format === 'csv' && read.columns" class="group" aria-labelledby="columns-title">
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

        <section v-if="anyPdf" class="group" aria-labelledby="pdf-title">
          <h2 id="pdf-title" class="group-title">{{ several ? 'From the PDFs' : 'From the PDF' }}</h2>
          <div class="card">
            <label class="field check">
              <input v-model="pdfFlip" type="checkbox">
              <span>Money in and money out are the wrong way round</span>
            </label>
          </div>
          <p class="group-footer">
            Each line of a statement that starts with a date and ends with an amount is read as a transaction.
            Check the preview against your statement: if a payment or deposit shows as money out, tick this.
          </p>
        </section>

        <section class="group" aria-labelledby="preview-title">
          <h2 id="preview-title" class="group-title">Preview</h2>
          <div class="card card-pad stack">
            <p v-if="several">
              <span v-for="(x, i) in readable" :key="i">{{ i ? ', ' : '' }}{{ x.file.name }} ({{ plural(x.read.rows.length, 'transaction') }})</span>.
            </p>
            <p v-if="range">
              <strong>{{ plural(rows.length, 'transaction') }}</strong>,
              {{ day(range.first) }} to {{ day(range.last) }}.
              <span class="muted">Out <span class="num">{{ formatCents(totals.out) }}</span>, in <span class="num">{{ formatCents(totals.into) }}</span>.</span>
            </p>
            <p v-if="closing" data-test="closing">
              Closing balance <strong class="num">{{ formatCents(closing.cents) }}</strong> on {{ day(closing.date) }}<template v-if="account?.linked">, but the bank link keeps this account's balance</template><template v-else-if="account?.balance_date && account.balance_date > closing.date">, older than the balance it has</template><template v-else>: it becomes the account's balance</template>.
            </p>
            <p v-else>No transactions could be read. Check the columns above.</p>
            <div v-if="problems.length" class="notice notice-info">
              {{ plural(problems.length, 'line') }} won't be imported:
              <span v-for="(p, i) in problems.slice(0, 3)" :key="`${p.name}:${p.line}`">{{ i ? '; ' : ' ' }}{{ several ? `${p.name} ` : '' }}line {{ p.line }}, {{ p.problem }}</span>{{ problems.length > 3 ? '…' : '.' }}
            </div>
            <div class="scroll">
              <table class="preview">
                <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col" class="amt">Amount</th></tr></thead>
                <tbody>
                  <tr v-for="(r, i) in rows.slice(0, 20)" :key="i">
                    <td class="num nowrap">{{ r.posted }}</td>
                    <td>{{ r.description }}</td>
                    <td class="num amt" :class="moneyTone(r.amount_cents)">{{ formatCents(r.amount_cents) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="rows.length > 20" class="footnote">And {{ plural(rows.length - 20, 'more', 'more') }}.</p>
            <div class="btn-row">
              <button class="btn btn-primary" :disabled="sending || !rows.length" @click="importFiles">
                <span v-if="sending" class="spinner" aria-hidden="true" /> Import {{ plural(rows.length, 'transaction') }}<template v-if="several"> from {{ readable.length }} files</template>
              </button>
            </div>
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
.preview td { padding: 0.375rem 0.5rem 0.375rem 0; border-top: var(--border); vertical-align: top; }
.amt { text-align: right; white-space: nowrap; padding-right: 0 !important; }
.nowrap { white-space: nowrap; }
.name { overflow-wrap: anywhere; }
</style>
