<script setup lang="ts">
import { formatCents, type Account, type Transaction } from '~~/shared/accounts'
import { BUILT_IN, categoryOf, isCategoryRef, periodOf, type Category, type SpendingSummary } from '~~/shared/categories'

// Spending only reads the accounts set up on Accounts. Every transaction is
// sorted into a category on its own; what a person does here is move one
// that landed in the wrong place (the rest of that merchant's follow), make
// categories of their own to move them into, search, add one by hand, and
// change or leave out one (components/spending/SpendingTransactions.vue).

const route = useRoute()
const router = useRouter()
const text = (v: unknown) => (typeof v === 'string' ? v : '')

// The view lives in the address, so a category can be linked to and Back leaves it.
const kind = computed(() => (route.query.period === 'year' ? 'year' : 'month'))
const today = useToday()
const period = computed(() => periodOf(kind.value, text(route.query.at) || undefined, today))
const account = computed(() => text(route.query.account))
// A category's id, "all" for every transaction, or "" for the categories.
const category = computed(() => (route.query.category === 'all' || isCategoryRef(route.query.category) ? route.query.category as string : ''))
const page = computed(() => Math.max(1, Number.parseInt(text(route.query.page), 10) || 1))
// A search spans every date, in the account picked.
const q = computed(() => text(route.query.q))
const min = computed(() => text(route.query.min))
const max = computed(() => text(route.query.max))
const searching = computed(() => !!(q.value || min.value || max.value))

function go(change: Record<string, string | undefined>) {
  const query: Record<string, string> = {}
  const next = {
    period: kind.value === 'year' ? 'year' : undefined, at: text(route.query.at) || undefined, account: account.value || undefined, category: category.value || undefined,
    q: q.value || undefined, min: min.value || undefined, max: max.value || undefined, page: undefined, ...change,
  }
  for (const [k, v] of Object.entries(next)) if (v) query[k] = v
  return router.push({ query })
}

const { data: list } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const names = computed(() => new Map(list.value.accounts.map(a => [a.id, a.name])))

const { data: cats, refresh: refreshCats } = await useFetch<{ categories: Category[] }>('/api/categories', { key: 'categories', default: () => ({ categories: BUILT_IN }) })
const all = computed(() => cats.value.categories)
const label = (id: string) => categoryOf(id, all.value).label
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

// The list shown: a search's, or a category's (or every one) for the period.
const listQuery = computed(() => {
  const query: Record<string, string> = {}
  if (account.value) query.account = account.value
  if (searching.value) Object.assign(query, { q: q.value, min: min.value, max: max.value })
  else {
    Object.assign(query, { from: period.value.from, to: period.value.to })
    if (category.value && category.value !== 'all') query.category = category.value
  }
  return query
})
const listing = computed(() => searching.value || !!category.value)
const { data: txs, pending, error: txError, refresh: refreshTxs } = await useFetch<{ items: Transaction[], page: number, pages: number, total: number }>('/api/transactions', {
  query: computed(() => ({ ...listQuery.value, page: page.value })),
  default: () => ({ items: [], page: 1, pages: 0, total: 0 }),
  immediate: listing.value,
  watch: false,
})
watch([listQuery, page], () => { if (listing.value) refreshTxs() })

// What's shown, as a spreadsheet: the search, or the period, account and category picked.
const csvHref = computed(() => `/api/transactions/csv?${new URLSearchParams(Object.entries(listQuery.value).filter(([, v]) => v))}`)
const csvWhat = computed(() => {
  if (searching.value) return 'what the search found'
  return category.value && category.value !== 'all' ? `${label(category.value)} for ${period.value.label}` : `every transaction for ${period.value.label}`
})

// Searching by words and an amount's size.
const search = reactive({ q: q.value, min: min.value, max: max.value })
watch([q, min, max], () => Object.assign(search, { q: q.value, min: min.value, max: max.value }))
const sizing = ref(!!(min.value || max.value))
function find() {
  const words = search.q.trim()
  if (!words && !search.min.trim() && !search.max.trim()) return clearSearch()
  return go({ q: words || undefined, min: search.min.trim() || undefined, max: search.max.trim() || undefined, category: undefined })
}
function clearSearch() {
  Object.assign(search, { q: '', min: '', max: '' })
  sizing.value = false
  return go({ q: undefined, min: undefined, max: undefined })
}
const found = computed(() => {
  const size = min.value && max.value ? `$${min.value} to $${max.value}` : min.value ? `$${min.value} or more` : max.value ? `up to $${max.value}` : ''
  const what = [q.value && `“${q.value}”`, size].filter(Boolean).join(', ')
  return `${txs.value.total.toLocaleString()} ${txs.value.total === 1 ? 'transaction' : 'transactions'} for ${what}, any date`
})

// Something changed (moved, edited, added, deleted): the totals follow, then it's said.
const notice = ref('')
// Adding by hand only goes into an account no bank link keeps.
const canAdd = computed(() => list.value.accounts.some(a => !a.linked))
const adding = ref(false)
async function changed(message: string) {
  notice.value = ''
  await Promise.all([refreshSummary(), refreshTxs()])
  notice.value = message
}

const comparison = computed(() => {
  const was = summary.value.previous_spent_cents
  const now = summary.value.spent_cents
  const before = kind.value === 'year' ? 'last year' : 'last month'
  if (!was) return ''
  if (now === was) return `The same as ${before}.`
  return `${formatCents(Math.abs(now - was))} ${now > was ? 'more' : 'less'} than ${before}.`
})

watch([category, q, min, max], () => { renaming.value = false; deleting.value = false; notice.value = '' })

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
</script>

<template>
  <div>
    <AppHeader title="Spending">
      <button v-if="canAdd && !adding" class="btn btn-tinted" @click="adding = true">Add a transaction</button>
    </AppHeader>

    <section v-if="!list.accounts.length" class="group">
      <div class="card card-pad stack">
        <p class="headline">No accounts yet</p>
        <p class="muted">Link your banks and cards, or add accounts and import their statements, on Accounts. Their transactions show up here, sorted into categories.</p>
        <NuxtLink to="/accounts" class="btn btn-primary">Set up accounts</NuxtLink>
      </div>
    </section>

    <template v-else>
      <!-- One toolbar: when, which account, and a search. -->
      <section class="group toolbar" aria-label="Which spending">
        <div v-if="!searching" class="bar-row">
          <div class="segmented" role="group" aria-label="Period">
            <button class="seg" :aria-pressed="kind === 'month'" @click="go({ period: undefined, at: undefined })">Month</button>
            <button class="seg" :aria-pressed="kind === 'year'" @click="go({ period: 'year', at: undefined })">Year</button>
          </div>
          <div class="stepper">
            <button class="btn btn-plain" :aria-label="`Before ${period.label}`" @click="go({ at: period.prev })"><AppIcon name="chevron" class="back" /></button>
            <span class="headline num when" aria-live="polite">{{ period.label }}</span>
            <button class="btn btn-plain" :aria-label="`After ${period.label}`" @click="go({ at: period.next })"><AppIcon name="chevron" /></button>
          </div>
          <label class="pick">
            <span class="visually-hidden">Account</span>
            <select class="select" :value="account" @change="go({ account: ($event.target as HTMLSelectElement).value || undefined })">
              <option value="">All accounts</option>
              <option v-for="a in list.accounts" :key="a.id" :value="a.id">{{ a.name }}{{ a.excluded ? ' (not counted)' : a.closed_on ? ' (closed)' : '' }}</option>
            </select>
          </label>
        </div>
        <form class="bar-row search" role="search" @submit.prevent="find">
          <label class="visually-hidden" for="search-q">Search transactions</label>
          <input id="search-q" v-model="search.q" class="input" type="search" maxlength="100" placeholder="Search transactions" enterkeyhint="search">
          <template v-if="sizing">
            <label class="size"><span class="visually-hidden">Amount from</span><input v-model="search.min" class="input num" inputmode="decimal" placeholder="From $0"></label>
            <label class="size"><span class="visually-hidden">to</span><input v-model="search.max" class="input num" inputmode="decimal" placeholder="To any"></label>
          </template>
          <button class="btn btn-tinted">Search</button>
          <button v-if="!sizing" type="button" class="link" @click="sizing = true">By amount</button>
          <a class="link csv" :href="csvHref" :title="`Download ${csvWhat} as a spreadsheet`" download>Download CSV</a>
        </form>
      </section>

      <SpendingAddTransaction v-model:open="adding" :accounts="list.accounts" :account="account" @added="changed" />
      <p v-if="notice" class="notice notice-success group" role="status">{{ notice }}</p>

      <p v-if="summaryError" class="notice notice-error group" role="alert">{{ errorMessage(summaryError) }}</p>

      <!-- What a search found, on any date. -->
      <template v-else-if="searching">
        <section class="group" aria-labelledby="found-title">
          <div class="card card-pad tight">
            <h2 id="found-title" class="title-2">Search</h2>
            <p class="footnote" aria-live="polite">{{ found }}<template v-if="account"> in {{ names.get(account) }}</template></p>
            <p><button class="btn btn-plain clear" @click="clearSearch">Clear search</button></p>
          </div>
        </section>
        <section class="group" aria-label="Transactions found">
          <p v-if="txError" class="notice notice-error" role="alert">{{ errorMessage(txError) }}</p>
          <div v-else-if="!txs.items.length" class="card card-pad">
            <p class="muted">Nothing matches. Try fewer words, or a wider amount.</p>
          </div>
          <SpendingTransactions v-else :items="txs.items" :categories="all" :names="names" :show-account="!account" :busy="pending" @changed="changed" />
          <div v-if="txs.pages > 1" class="btn-row pager">
            <button class="btn btn-plain" :disabled="page <= 1" @click="go({ page: String(page - 1) })">Newer</button>
            <span class="footnote">Page {{ txs.page }} of {{ txs.pages }}</span>
            <button class="btn btn-plain" :disabled="page >= txs.pages" @click="go({ page: String(page + 1) })">Older</button>
          </div>
          <p class="group-footer">Open one to give it a name of your own, add a note, split it across categories, or leave it out of spending and taxes.</p>
        </section>
      </template>

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
          <p v-if="txError" class="notice notice-error" role="alert">{{ errorMessage(txError) }}</p>
          <div v-else-if="!txs.items.length" class="card card-pad">
            <p class="muted">{{ category === 'all' ? 'No transactions' : `Nothing in ${label(category)}` }} for {{ period.label }}.</p>
          </div>
          <SpendingTransactions v-else :items="txs.items" :categories="all" :names="names" :show-account="!account" :busy="pending" @changed="changed" />
          <div v-if="txs.pages > 1" class="btn-row pager">
            <button class="btn btn-plain" :disabled="page <= 1" @click="go({ page: String(page - 1) })">Newer</button>
            <span class="footnote">Page {{ txs.page }} of {{ txs.pages }}</span>
            <button class="btn btn-plain" :disabled="page >= txs.pages" @click="go({ page: String(page + 1) })">Older</button>
          </div>
          <p class="group-footer">In the wrong place? Pick its category, or make a new one. The rest from the same place move with it, and new ones follow. Open one to name it, add a note, split it across categories, or leave it out of spending and taxes.</p>
        </section>
      </template>

      <!-- Every category for the period: spending on the left, the rest beside it. -->
      <div v-else class="cols">
        <div>
          <section class="group" aria-labelledby="cats-title">
            <div class="card">
              <div class="spent">
                <p class="footnote">Spent in {{ period.label }}</p>
                <p class="num spent-value" :class="spendTone(summary.spent_cents)">{{ formatCents(summary.spent_cents) }}</p>
                <p v-if="comparison" class="footnote">{{ comparison }}</p>
              </div>
              <div class="panel-head top-line">
                <h2 id="cats-title" class="panel-title">Categories</h2>
              </div>
              <div v-if="!spending.length" class="card-pad stack">
                <p class="muted">No spending in {{ period.label }}. Transactions arrive when a linked bank syncs, or when you import a statement on Accounts.</p>
                <NuxtLink to="/accounts" class="btn btn-tinted">Go to Accounts</NuxtLink>
              </div>
              <ul v-else class="list">
                <li v-for="c in spending" :key="c.id">
                  <NuxtLink :to="{ query: { ...route.query, category: c.id, page: undefined } }" class="row cat">
                    <span class="row-label">
                      <span class="cat-head"><span class="cat-name">{{ c.label }}</span><span class="num" :class="spendTone(c.total_cents)">{{ formatCents(c.total_cents) }}</span></span>
                      <span class="bar" aria-hidden="true"><span class="bar-fill" :style="{ width: share(c.total_cents) }" /></span>
                      <span class="caption">{{ c.count.toLocaleString() }} {{ c.count === 1 ? 'transaction' : 'transactions' }}</span>
                    </span>
                    <AppIcon name="chevron" class="chev" />
                  </NuxtLink>
                </li>
              </ul>
            </div>
            <p class="group-footer">Something in the wrong place? Open it and pick another category; that merchant's other transactions follow.</p>
          </section>
        </div>

        <div>
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
          </section>

          <section v-if="notSpending.length" class="group" aria-labelledby="other-title">
            <h2 id="other-title" class="group-title">Income and transfers</h2>
            <ul class="card list">
              <li v-for="c in notSpending" :key="c.id">
                <NuxtLink :to="{ query: { ...route.query, category: c.id, page: undefined } }" class="row cat">
                  <span class="row-label">
                    <span class="cat-head"><span class="cat-name">{{ c.label }}</span><span class="num" :class="moneyTone(c.total_cents)">{{ formatCents(c.total_cents) }}</span></span>
                    <span class="caption">{{ c.count.toLocaleString() }} {{ c.count === 1 ? 'transaction' : 'transactions' }}</span>
                  </span>
                  <AppIcon name="chevron" class="chev" />
                </NuxtLink>
              </li>
            </ul>
            <p class="group-footer">Neither counts as spending, nor does paying off a card: its purchases already count.</p>
          </section>

          <SpendingRecurring :account="account" :names="names" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.pager { justify-content: space-between; align-items: center; margin-top: 0.5rem; }

.toolbar { display: grid; gap: 0.75rem; }
.bar-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.pick { margin-left: auto; }
.pick .select { width: auto; min-width: 12rem; max-width: 100%; background: var(--surface); border-color: var(--separator); }
.search .input { flex: 1 1 14rem; width: auto; min-width: 0; background: var(--surface); border-color: var(--separator); }
.search .size { flex: 0 1 8rem; min-width: 0; }
.search .size .input { width: 100%; }
.csv { margin-left: auto; }
.search .link { display: inline-flex; align-items: center; min-height: 2.75rem; font-size: 0.9375rem; }

@media (min-width: 900px) {
  .cols { display: grid; grid-template-columns: 3fr 2fr; gap: 1.5rem; align-items: start; }
}
.spent { padding: 1.125rem 1.25rem 1.25rem; }
.spent p { margin: 0; }
.spent-value { font-size: 2rem; font-weight: 700; letter-spacing: -0.015em; line-height: 1.2; }
.top-line { border-top: var(--border); }
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

.inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.75rem; }
.inline-form .input { flex: 1 1 12rem; width: auto; }
.link { padding: 0; border: 0; background: none; font: inherit; color: var(--accent); cursor: pointer; }
.clear { margin-left: -0.75rem; }
.grow { flex: 1 1 12rem; }
.danger { color: var(--critical); }
</style>
