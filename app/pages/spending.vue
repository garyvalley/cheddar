<script setup lang="ts">
import { formatCents, type Account, type Transaction } from '~~/shared/accounts'
import { BUILT_IN, categoryOf, isCategoryRef, periodOf, type Category, type SpendingSummary } from '~~/shared/categories'

// Spending only reads the accounts set up on Accounts. Every transaction is
// sorted into a category on its own; what a person does here is move one
// that landed in the wrong place (the rest of that merchant's follow), and
// make categories of their own to move them into.

const route = useRoute()
const router = useRouter()
const text = (v: unknown) => (typeof v === 'string' ? v : '')
const NEW = '__new'

// The view lives in the address, so a category can be linked to and Back leaves it.
const kind = computed(() => (route.query.period === 'year' ? 'year' : 'month'))
const today = useToday()
const period = computed(() => periodOf(kind.value, text(route.query.at) || undefined, today))
const account = computed(() => text(route.query.account))
// A category's id, "all" for every transaction, or "" for the categories.
const category = computed(() => (route.query.category === 'all' || isCategoryRef(route.query.category) ? route.query.category as string : ''))
const page = computed(() => Math.max(1, Number.parseInt(text(route.query.page), 10) || 1))

function go(change: Record<string, string | undefined>) {
  const query: Record<string, string> = {}
  const next = { period: kind.value === 'year' ? 'year' : undefined, at: text(route.query.at) || undefined, account: account.value || undefined, category: category.value || undefined, page: undefined, ...change }
  for (const [k, v] of Object.entries(next)) if (v) query[k] = v
  return router.push({ query })
}

const { data: list } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const names = computed(() => new Map(list.value.accounts.map(a => [a.id, a.name])))

const { data: cats, refresh: refreshCats } = await useFetch<{ categories: Category[] }>('/api/categories', { key: 'categories', default: () => ({ categories: BUILT_IN }) })
const all = computed(() => cats.value.categories)
const label = (id: string) => categoryOf(id, all.value).label
const builtInSpending = computed(() => all.value.filter(c => !c.custom && c.spending))
const yours = computed(() => all.value.filter(c => c.custom))
const notSpent = computed(() => all.value.filter(c => !c.spending))
const viewing = computed(() => all.value.find(c => c.id === category.value))

const { data: summary, error: summaryError, refresh: refreshSummary } = await useFetch<SpendingSummary>('/api/spending', {
  query: { period: kind, at: computed(() => period.value.at), account },
  default: () => ({ from: '', to: '', spent_cents: 0, income_cents: 0, previous_spent_cents: 0, categories: [] }),
})
const spending = computed(() => summary.value.categories.filter(c => c.spending))
const notSpending = computed(() => summary.value.categories.filter(c => !c.spending))
const largest = computed(() => Math.max(1, ...spending.value.map(c => c.total_cents)))
const share = (cents: number) => `${Math.max(0, Math.min(100, (cents / largest.value) * 100)).toFixed(1)}%`
const current = computed(() => summary.value.categories.find(c => c.id === category.value))
const count = computed(() => summary.value.categories.reduce((n, c) => n + c.count, 0))

const { data: txs, pending, error: txError, refresh: refreshTxs } = await useFetch<{ items: Transaction[], page: number, pages: number, total: number }>('/api/transactions', {
  query: { account, category: computed(() => (category.value === 'all' ? '' : category.value)), from: computed(() => period.value.from), to: computed(() => period.value.to), page },
  default: () => ({ items: [], page: 1, pages: 0, total: 0 }),
  immediate: !!category.value,
  watch: false,
})
watch([category, account, period, page], () => { if (category.value) refreshTxs() })

// What's shown, as a spreadsheet: the period, the account and the category picked.
const csvHref = computed(() => {
  const q = new URLSearchParams({ from: period.value.from, to: period.value.to })
  if (account.value) q.set('account', account.value)
  if (category.value && category.value !== 'all') q.set('category', category.value)
  return `/api/transactions/csv?${q}`
})
const csvWhat = computed(() => (category.value && category.value !== 'all' ? `${label(category.value)} for ${period.value.label}` : `every transaction for ${period.value.label}`))

const comparison = computed(() => {
  const was = summary.value.previous_spent_cents
  const now = summary.value.spent_cents
  const before = kind.value === 'year' ? 'last year' : 'last month'
  if (!was) return ''
  if (now === was) return `The same as ${before}.`
  return `${formatCents(Math.abs(now - was))} ${now > was ? 'more' : 'less'} than ${before}.`
})

// Moving a transaction to another category, maybe a new one of the person's own.
const move = useAction()
const moved = ref('')
const naming = ref('') // the transaction a new category is being named for
const newName = ref('')
async function recategorize(t: Transaction, to: string) {
  moved.value = ''
  if (to === categoryOf(t.category, all.value).id) return
  const r = await move.run(() => $fetch<{ moved: number }>(`/api/transactions/${t.id}/category`, { method: 'POST', body: { category: to } }))
  if (!r) return
  const what = t.payee || t.description || 'It'
  const others = r.moved === 1 ? ' 1 more from the same place moved too.' : r.moved > 1 ? ` ${r.moved} more from the same place moved too.` : ''
  moved.value = `${what} is now in ${label(to)}.${others} New ones from there will go to ${label(to)} as well.`
  await Promise.all([refreshSummary(), refreshTxs()])
}
function picked(t: Transaction, event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value !== NEW) return recategorize(t, select.value)
  select.value = categoryOf(t.category, all.value).id
  naming.value = t.id
  newName.value = ''
}
async function createFor(t: Transaction) {
  const r = await move.run(() => $fetch<{ category: Category }>('/api/categories', { method: 'POST', body: { name: newName.value } }))
  if (!r) return
  await refreshCats()
  naming.value = ''
  await recategorize(t, r.category.id)
}
watch(category, () => { moved.value = ''; move.error.value = ''; naming.value = ''; renaming.value = false; deleting.value = false })

// Renaming or deleting one of the person's own categories, from its page.
const manage = useAction()
const renaming = ref(false)
const deleting = ref(false)
const rename = ref('')
function startRename() {
  rename.value = viewing.value?.label ?? ''
  renaming.value = true
}
async function saveRename() {
  if (!await manage.run(() => $fetch(`/api/categories/${category.value}/rename`, { method: 'POST', body: { name: rename.value } }))) return
  renaming.value = false
  await Promise.all([refreshCats(), refreshSummary()])
}
async function confirmDelete() {
  if (!await manage.run(() => $fetch(`/api/categories/${category.value}/remove`, { method: 'POST' }))) return
  deleting.value = false
  await Promise.all([refreshCats(), refreshSummary()])
  await go({ category: undefined })
}

const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
</script>

<template>
  <div>
    <AppHeader title="Spending" />

    <section v-if="!list.accounts.length" class="group">
      <div class="card card-pad stack">
        <p class="headline">No accounts yet</p>
        <p class="muted">Link your banks and cards, or add accounts and import their statements, on Accounts. Their transactions show up here, sorted into categories.</p>
        <NuxtLink to="/accounts" class="btn btn-primary">Set up accounts</NuxtLink>
      </div>
    </section>

    <template v-else>
      <section class="group" aria-label="Which spending">
        <div class="card">
          <div class="row period">
            <div class="segmented" role="group" aria-label="Period">
              <button class="seg" :aria-pressed="kind === 'month'" @click="go({ period: undefined, at: undefined })">Month</button>
              <button class="seg" :aria-pressed="kind === 'year'" @click="go({ period: 'year', at: undefined })">Year</button>
            </div>
            <div class="stepper">
              <button class="btn btn-plain" :aria-label="`Before ${period.label}`" @click="go({ at: period.prev })"><AppIcon name="chevron" class="back" /></button>
              <span class="headline num when" aria-live="polite">{{ period.label }}</span>
              <button class="btn btn-plain" :aria-label="`After ${period.label}`" @click="go({ at: period.next })"><AppIcon name="chevron" /></button>
            </div>
          </div>
          <label class="field">
            <span class="field-label">Account</span>
            <select class="select" :value="account" @change="go({ account: ($event.target as HTMLSelectElement).value || undefined })">
              <option value="">All accounts</option>
              <option v-for="a in list.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <div class="row">
            <span class="row-label footnote">Download {{ csvWhat }} as a spreadsheet.</span>
            <a class="btn btn-tinted" :href="csvHref" download>Download CSV</a>
          </div>
        </div>
      </section>

      <p v-if="summaryError" class="notice notice-error group" role="alert">{{ errorMessage(summaryError) }}</p>

      <!-- One category's transactions, where one can be moved to another category. -->
      <template v-else-if="category">
        <section class="group" aria-labelledby="cat-title">
          <p><NuxtLink :to="{ query: { ...route.query, category: undefined, page: undefined } }" class="back-link"><AppIcon name="chevron" class="back" /> All categories</NuxtLink></p>
          <div v-if="category === 'all'" class="card card-pad tight">
            <h2 id="cat-title" class="title-2">All transactions</h2>
            <p class="footnote">{{ period.label }} · {{ txs.total.toLocaleString() }} {{ txs.total === 1 ? 'transaction' : 'transactions' }}</p>
          </div>
          <div v-else class="card card-pad tight">
            <h2 id="cat-title" class="title-2">{{ label(category) }}</h2>
            <p class="num title-3 total" :class="current?.spending ? spendTone(current.total_cents) : moneyTone(current?.total_cents ?? 0)">{{ formatCents(current?.total_cents ?? 0) }}</p>
            <p class="footnote">{{ period.label }} · {{ (current?.count ?? 0).toLocaleString() }} {{ current?.count === 1 ? 'transaction' : 'transactions' }}<template v-if="viewing?.custom"> · Your own category</template></p>
            <template v-if="viewing?.custom">
              <form v-if="renaming" class="inline-form" @submit.prevent="saveRename">
                <label class="visually-hidden" for="rename">New name</label>
                <input id="rename" v-model="rename" class="input" maxlength="40" required>
                <button class="btn btn-primary" :disabled="manage.busy.value"><span v-if="manage.busy.value" class="spinner" aria-hidden="true" /> Save</button>
                <button type="button" class="btn btn-plain" @click="renaming = false">Cancel</button>
              </form>
              <div v-else-if="deleting" class="inline-form">
                <span class="footnote grow">Delete {{ viewing.label }}? Its transactions go back to being sorted on their own.</span>
                <button class="btn btn-plain" @click="deleting = false">Cancel</button>
                <button class="btn btn-danger" :disabled="manage.busy.value" @click="confirmDelete"><span v-if="manage.busy.value" class="spinner" aria-hidden="true" /> Delete</button>
              </div>
              <p v-else class="btn-row">
                <button class="btn btn-tinted" @click="startRename">Rename</button>
                <button class="btn btn-plain danger" @click="deleting = true">Delete…</button>
              </p>
              <p v-if="manage.error.value" class="notice notice-error" role="alert">{{ manage.error.value }}</p>
            </template>
          </div>
        </section>

        <section class="group" aria-labelledby="tx-title">
          <h2 id="tx-title" class="group-title">Transactions</h2>
          <p v-if="moved" class="notice notice-success moved" role="status">{{ moved }}</p>
          <p v-if="move.error.value" class="notice notice-error moved" role="alert">{{ move.error.value }}</p>
          <p v-if="txError" class="notice notice-error" role="alert">{{ errorMessage(txError) }}</p>
          <div v-else-if="!txs.items.length" class="card card-pad">
            <p class="muted">{{ category === 'all' ? 'No transactions' : `Nothing in ${label(category)}` }} for {{ period.label }}.</p>
          </div>
          <ul v-else class="card list" :aria-busy="pending || move.busy.value">
            <li v-for="t in txs.items" :key="t.id" class="tx-item">
              <div class="row tx">
                <span class="row-label">
                  <span class="block desc">{{ t.description || 'No description' }}</span>
                  <span class="footnote">{{ day(t.posted) }}<template v-if="!account"> · {{ names.get(t.account) }}</template><template v-if="t.pending"> · Pending</template></span>
                </span>
                <span class="tx-side">
                  <span class="num amount" :class="moneyTone(t.amount_cents)">{{ formatCents(t.amount_cents) }}</span>
                  <select
                    class="chip" :value="categoryOf(t.category, all).id" :disabled="move.busy.value"
                    :aria-label="`Category for ${t.description || 'this transaction'}`"
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
              <form v-if="naming === t.id" class="inline-form new-cat" @submit.prevent="createFor(t)">
                <label class="visually-hidden" :for="`new-${t.id}`">Name for the new category</label>
                <input :id="`new-${t.id}`" v-model="newName" class="input" maxlength="40" placeholder="New category's name" required>
                <button class="btn btn-primary" :disabled="move.busy.value"><span v-if="move.busy.value" class="spinner" aria-hidden="true" /> Add</button>
                <button type="button" class="btn btn-plain" @click="naming = ''">Cancel</button>
              </form>
            </li>
          </ul>
          <div v-if="txs.pages > 1" class="btn-row pager">
            <button class="btn btn-plain" :disabled="page <= 1" @click="go({ page: String(page - 1) })">Newer</button>
            <span class="footnote">Page {{ txs.page }} of {{ txs.pages }}</span>
            <button class="btn btn-plain" :disabled="page >= txs.pages" @click="go({ page: String(page + 1) })">Older</button>
          </div>
          <p class="group-footer">In the wrong place? Pick its category, or make a new one. The rest from the same place move with it, and new ones follow.</p>
        </section>
      </template>

      <!-- Every category for the period. -->
      <template v-else>
        <section class="group" aria-labelledby="spent-title">
          <div class="card card-pad tight">
            <h2 id="spent-title" class="footnote">Spent in {{ period.label }}</h2>
            <p class="num large-title" :class="spendTone(summary.spent_cents)">{{ formatCents(summary.spent_cents) }}</p>
            <p v-if="comparison" class="footnote">{{ comparison }}</p>
          </div>
        </section>

        <section class="group" aria-labelledby="cats-title">
          <h2 id="cats-title" class="group-title">Categories</h2>
          <div v-if="!spending.length" class="card card-pad stack">
            <p class="muted">No spending in {{ period.label }}. Transactions arrive when a linked bank syncs, or when you import a statement on Accounts.</p>
            <NuxtLink to="/accounts" class="btn btn-tinted">Go to Accounts</NuxtLink>
          </div>
          <ul v-else class="card list">
            <li v-for="c in spending" :key="c.id">
              <NuxtLink :to="{ query: { ...route.query, category: c.id, page: undefined } }" class="row cat">
                <span class="row-label">
                  <span class="cat-head"><span class="cat-name">{{ c.label }}</span><span class="num" :class="spendTone(c.total_cents)">{{ formatCents(c.total_cents) }}</span></span>
                  <span class="bar" aria-hidden="true"><span class="bar-fill" :style="{ width: share(c.total_cents) }" /></span>
                  <span class="footnote">{{ c.count.toLocaleString() }} {{ c.count === 1 ? 'transaction' : 'transactions' }}</span>
                </span>
                <AppIcon name="chevron" class="chev" />
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section v-if="count" class="group" aria-label="Every transaction">
          <div class="card">
            <NuxtLink :to="{ query: { ...route.query, category: 'all', page: undefined } }" class="row cat">
              <span class="row-label">
                <span class="block">All transactions</span>
                <span class="footnote">{{ count.toLocaleString() }} in {{ period.label }}</span>
              </span>
              <AppIcon name="chevron" class="chev" />
            </NuxtLink>
          </div>
          <p class="group-footer">Something in the wrong place? Open it and pick another category, or make one of your own. Cheddar remembers, and that merchant's other transactions follow.</p>
        </section>

        <SpendingRecurring :account="account" :names="names" />

        <section v-if="notSpending.length" class="group" aria-labelledby="other-title">
          <h2 id="other-title" class="group-title">Income and transfers</h2>
          <ul class="card list">
            <li v-for="c in notSpending" :key="c.id">
              <NuxtLink :to="{ query: { ...route.query, category: c.id, page: undefined } }" class="row cat">
                <span class="row-label">
                  <span class="cat-head"><span class="cat-name">{{ c.label }}</span><span class="num" :class="moneyTone(c.total_cents)">{{ formatCents(c.total_cents) }}</span></span>
                  <span class="footnote">{{ c.count.toLocaleString() }} {{ c.count === 1 ? 'transaction' : 'transactions' }}</span>
                </span>
                <AppIcon name="chevron" class="chev" />
              </NuxtLink>
            </li>
          </ul>
          <p class="group-footer">Neither counts as spending. A payment to your card isn't either: the purchases on the card already count.</p>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: 0.5px solid var(--separator); }
.desc { overflow-wrap: anywhere; }
.amount { white-space: nowrap; }
.pager { justify-content: space-between; align-items: center; margin-top: 0.5rem; }

.period { justify-content: space-between; flex-wrap: wrap; }
.stepper { display: inline-flex; align-items: center; gap: 0.25rem; }
.when { min-width: 9.5rem; text-align: center; }
.back { transform: rotate(180deg); }

.cat { color: var(--text); }
.cat:hover { text-decoration: none; background: var(--surface-2); }
.cat-head { display: flex; justify-content: space-between; gap: 0.75rem; }
.cat-name { min-width: 0; overflow-wrap: anywhere; }
.bar { display: block; height: 6px; margin: 0.375rem 0 0.25rem; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--loss); }
.chev { color: var(--text-3); flex: none; }

.back-link { display: inline-flex; align-items: center; gap: 0.25rem; margin: 0 0 0.5rem 0.5rem; min-height: 2.75rem; }
.tight > * { margin: 0; }
.tight > * + * { margin-top: 0.25rem; }

.tx { align-items: flex-start; }
.tx-side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
.chip {
  max-width: 11rem; min-height: 2.25rem; padding: 0.25rem 0.5rem;
  font: inherit; font-size: 0.8125rem; color: var(--accent);
  background: var(--accent-soft); border: 1px solid transparent; border-radius: 999px; cursor: pointer;
}
.chip:focus-visible { border-color: var(--focus); }
.moved { margin-bottom: 0.75rem; }
.inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.75rem; }
.inline-form .input { flex: 1 1 12rem; width: auto; }
.new-cat { margin: 0; padding: 0 1rem 0.75rem; }
.grow { flex: 1 1 12rem; }
.danger { color: var(--critical); }
</style>
