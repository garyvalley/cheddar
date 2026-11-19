<script setup lang="ts">
import type { Budget } from '~~/shared/budgets'
import { formatCents, type Account, type Transaction } from '~~/shared/accounts'
import { BUILT_IN, categoryOf, isCategoryRef, isPeriodKind, parseRange, periodOf, type Category, type SpendingSummary } from '~~/shared/categories'
import type { TagTotal } from '~~/shared/tags'

// Spending only reads the accounts set up in Settings. Every transaction is
// sorted into a category on its own; what a person does here is move one
// that landed in the wrong place (the rest of that merchant's follow), make
// categories of their own to move them into, search, add one by hand, and
// change, tag or leave out one (components/spending/SpendingTransactions.vue).

const route = useRoute()
const router = useRouter()
const text = (v: unknown) => (typeof v === 'string' ? v : '')

// The view lives in the address, so a category can be linked to and Back leaves it.
const kind = computed(() => (isPeriodKind(route.query.period) ? route.query.period : 'month'))
const today = useToday()
const period = computed(() => periodOf(kind.value, text(route.query.at) || undefined, today))
const account = computed(() => text(route.query.account))
const reviewMode = computed(() => route.query.review === 'true')
// Needs review leaves out what new bank links brought in from before they were made, unless asked (shared/review.ts).
const withHistory = computed(() => reviewMode.value && route.query.history === 'true')
// A category's id, "all" for every transaction, or "" for the categories.
const category = computed(() => (route.query.category === 'all' || isCategoryRef(route.query.category) ? route.query.category as string : ''))
const page = computed(() => Math.max(1, Number.parseInt(text(route.query.page), 10) || 1))
// A search spans every date, in the account picked.
const q = computed(() => text(route.query.q))
const min = computed(() => text(route.query.min))
const max = computed(() => text(route.query.max))
const tag = computed(() => text(route.query.tag))
const searching = computed(() => !!(q.value || min.value || max.value || tag.value))

function go(change: Record<string, string | undefined>) {
  const query: Record<string, string> = {}
  const next = {
    period: kind.value === 'month' ? undefined : kind.value, at: text(route.query.at) || undefined, account: account.value || undefined, category: category.value || undefined,
    q: q.value || undefined, min: min.value || undefined, max: max.value || undefined, tag: tag.value || undefined, review: reviewMode.value ? 'true' : undefined, history: withHistory.value ? 'true' : undefined, page: undefined, ...change,
  }
  for (const [k, v] of Object.entries(next)) if (v) query[k] = v
  return router.push({ query })
}

// The list shown: a search's, or a category's (or every one) for the period.
const listQuery = computed(() => {
  const query: Record<string, string> = {}
  if (account.value) query.account = account.value
  if (reviewMode.value) {
    query.reviewed = 'false'
    if (!withHistory.value) query.history = 'false'
  }
  else if (searching.value) Object.assign(query, { q: q.value, min: min.value, max: max.value, tag: tag.value })
  else {
    Object.assign(query, { from: period.value.from, to: period.value.to })
    if (category.value && category.value !== 'all') query.category = category.value
  }
  return query
})
const listing = computed(() => reviewMode.value || searching.value || !!category.value)

// Every request the page makes starts at once (issue #114): awaited one by
// one, a first load waited for each in turn.
const [
  { data: list },
  { data: cats, refresh: refreshCats },
  { data: summary, error: summaryError, refresh: refreshSummary },
  { data: txs, pending, error: txError, refresh: refreshTxs },
  { data: waiting, refresh: refreshWaiting },
  // Tags: each one's total for the period, and every one used, to offer when tagging.
  { data: tagData, refresh: refreshTags },
  // Budgets: a monthly amount per spending category.
  { data: budgetList, refresh: refreshBudgets },
] = await Promise.all([
  useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) }),
  useFetch<{ categories: Category[] }>('/api/categories', { key: 'categories', default: () => ({ categories: BUILT_IN }) }),
  useFetch<SpendingSummary>('/api/spending', {
    query: { period: kind, at: computed(() => period.value.at), account },
    default: () => ({ from: '', to: '', spent_cents: 0, income_cents: 0, previous_spent_cents: 0, categories: [] }),
  }),
  useFetch<{ items: Transaction[], page: number, pages: number, total: number }>('/api/transactions', {
    query: computed(() => ({ ...listQuery.value, page: page.value })),
    default: () => ({ items: [], page: 1, pages: 0, total: 0 }),
    immediate: listing.value,
    watch: false,
  }),
  useFetch<{ waiting: number, history: number }>('/api/transactions/review', {
    query: computed(() => (account.value ? { account: account.value } : {})),
    default: () => ({ waiting: 0, history: 0 }),
    immediate: reviewMode.value,
    watch: false,
  }),
  useFetch<{ totals: TagTotal[], known: string[] }>('/api/tags', {
    query: { from: computed(() => period.value.from), to: computed(() => period.value.to), account },
    default: () => ({ totals: [], known: [] }),
  }),
  useFetch<{ budgets: Budget[] }>('/api/budgets', { default: () => ({ budgets: [] }) }),
])
const names = computed(() => new Map(list.value.accounts.map(a => [a.id, a.name])))

const all = computed(() => cats.value.categories)
const label = (id: string) => categoryOf(id, all.value).label
const viewing = computed(() => all.value.find(c => c.id === category.value))

const spending = computed(() => summary.value.categories.filter(c => c.spending))
const notSpending = computed(() => summary.value.categories.filter(c => !c.spending))
const largest = computed(() => Math.max(1, ...spending.value.map(c => c.total_cents)))
const share = (cents: number) => `${Math.max(0, Math.min(100, (cents / largest.value) * 100)).toFixed(1)}%`
const current = computed(() => summary.value.categories.find(c => c.id === category.value))
const count = computed(() => summary.value.categories.reduce((n, c) => n + c.count, 0))

watch([listQuery, page], () => { if (listing.value) refreshTxs() })
watch([reviewMode, account], () => { if (reviewMode.value) refreshWaiting() })

// What's shown, as a spreadsheet: the search, or the period, account and category picked.
const csvHref = computed(() => `/api/transactions/csv?${new URLSearchParams(Object.entries(listQuery.value).filter(([, v]) => v))}`)
const csvWhat = computed(() => {
  if (reviewMode.value) return 'transactions needing review'
  if (searching.value) return 'what the search found'
  return category.value && category.value !== 'all' ? `${label(category.value)} for ${period.value.label}` : `every transaction for ${period.value.label}`
})

// Searching by words, an amount's size and a tag.
const search = reactive({ q: q.value, min: min.value, max: max.value, tag: tag.value })
watch([q, min, max, tag], () => Object.assign(search, { q: q.value, min: min.value, max: max.value, tag: tag.value }))
const sizing = ref(!!(min.value || max.value))
function find() {
  const words = search.q.trim()
  if (!words && !search.min.trim() && !search.max.trim() && !search.tag) return clearSearch()
  return go({ q: words || undefined, min: search.min.trim() || undefined, max: search.max.trim() || undefined, tag: search.tag || undefined, category: undefined, review: undefined, history: undefined })
}
function clearSearch() {
  Object.assign(search, { q: '', min: '', max: '', tag: '' })
  sizing.value = false
  return go({ q: undefined, min: undefined, max: undefined, tag: undefined, review: undefined, history: undefined })
}
function showReview(value: boolean) {
  return go({ review: value ? 'true' : undefined, history: undefined, category: undefined, q: undefined, min: undefined, max: undefined, tag: undefined, page: undefined })
}
const found = computed(() => {
  const size = min.value && max.value ? `$${min.value} to $${max.value}` : min.value ? `$${min.value} or more` : max.value ? `up to $${max.value}` : ''
  const what = [q.value && `“${q.value}”`, size].filter(Boolean).join(', ')
  return `${txs.value.total.toLocaleString()} ${txs.value.total === 1 ? 'transaction' : 'transactions'}${what ? ` for ${what}` : ''}${tag.value ? ` tagged ${tag.value}` : ''}, any date`
})

// Something changed (moved, edited, added, deleted): the totals follow, then it's said.
const notice = ref('')
// Adding by hand only goes into an account no bank link keeps.
const canAdd = computed(() => list.value.accounts.some(a => a.owned !== false && !a.linked))
const adding = ref(false)
async function changed(message: string) {
  notice.value = ''
  await Promise.all([refreshSummary(), refreshTxs(), refreshTags(), reviewMode.value ? refreshWaiting() : undefined])
  notice.value = message
}
async function markReviewed(ids: string[]) {
  const result = await $fetch<{ updated: number }>('/api/transactions/review', { method: 'POST', body: { ids, reviewed: true } })
  await changed(`${result.updated} ${result.updated === 1 ? 'transaction' : 'transactions'} marked reviewed.`)
}

const comparison = computed(() => {
  const was = summary.value.previous_spent_cents
  const now = summary.value.spent_cents
  const before = { week: 'the week before', month: 'the month before', year: 'the year before', custom: 'the same number of days before' }[kind.value]
  if (!was) return ''
  if (now === was) return `The same as ${before}.`
  return `${formatCents(Math.abs(now - was))} ${now > was ? 'more' : 'less'} than ${before}.`
})

watch([category, q, min, max, tag], () => { renaming.value = false; deleting.value = false; notice.value = '' })

// A custom range: two dates, kept in the address as "from~to".
const range = reactive({ from: period.value.from, to: period.value.to })
watch(period, p => Object.assign(range, { from: p.from, to: p.to }))
const rangeProblem = ref('')
function showRange() {
  rangeProblem.value = ''
  const at = `${range.from}~${range.to}`
  if (!parseRange(at)) {
    rangeProblem.value = 'Pick a start on or before the end, up to five years apart.'
    return
  }
  return go({ period: 'custom', at })
}

// The category's budget (SpendingBudget sets it), and the totals it's shown against.
const thisBudget = computed(() => budgetList.value.budgets.find(b => b.category === category.value))
async function budgetChanged() {
  await Promise.all([refreshBudgets(), refreshSummary()])
}

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
      <NuxtLink to="/budget" class="btn btn-tinted">Monthly plan</NuxtLink>
      <NuxtLink to="/reports" class="btn btn-tinted">Reports</NuxtLink>
      <NuxtLink to="/cashflow" class="btn btn-tinted">Cash flow</NuxtLink>
      <button v-if="canAdd && !adding" class="btn btn-tinted" @click="adding = true">Add a transaction</button>
    </AppHeader>

    <section v-if="!list.accounts.length" class="group">
      <div class="card card-pad stack">
        <p class="headline">No accounts yet</p>
        <p class="muted">Link your banks and cards, or add accounts and import their statements, in Settings. Their transactions show up here, sorted into categories.</p>
        <NuxtLink to="/settings#accounts" class="btn btn-primary">Set up accounts</NuxtLink>
      </div>
    </section>

    <template v-else>
      <!-- One toolbar: when, which account, and a search. -->
      <section class="group toolbar" aria-label="Which spending">
        <div v-if="!searching" class="bar-row">
          <div v-if="!reviewMode" class="segmented" role="group" aria-label="Period">
            <button class="seg" :aria-pressed="kind === 'week'" @click="go({ period: 'week', at: undefined })">Week</button>
            <button class="seg" :aria-pressed="kind === 'month'" @click="go({ period: undefined, at: undefined })">Month</button>
            <button class="seg" :aria-pressed="kind === 'year'" @click="go({ period: 'year', at: undefined })">Year</button>
            <button class="seg" :aria-pressed="kind === 'custom'" @click="go({ period: 'custom', at: undefined })">Range</button>
          </div>
          <div v-if="!reviewMode" class="stepper">
            <button class="btn btn-plain" :aria-label="`Before ${period.label}`" @click="go({ at: period.prev })"><AppIcon name="chevron" class="back" /></button>
            <span class="headline num when" aria-live="polite">{{ period.label }}</span>
            <button class="btn btn-plain" :aria-label="`After ${period.label}`" @click="go({ at: period.next })"><AppIcon name="chevron" /></button>
          </div>
          <form v-if="!reviewMode && kind === 'custom'" class="range" @submit.prevent="showRange">
            <label><span class="visually-hidden">From</span><input v-model="range.from" class="input num" type="date" required></label>
            <span class="footnote">to</span>
            <label><span class="visually-hidden">To</span><input v-model="range.to" class="input num" type="date" required></label>
            <button class="btn btn-tinted">Show</button>
          </form>
          <label class="pick">
            <span class="visually-hidden">Account</span>
            <select class="select" :value="account" @change="go({ account: ($event.target as HTMLSelectElement).value || undefined })">
              <option value="">All accounts</option>
              <option v-for="a in list.accounts" :key="a.id" :value="a.id">{{ a.name }}{{ a.excluded ? ' (not counted)' : a.closed_on ? ' (closed)' : '' }}</option>
            </select>
          </label>
          <button class="btn" :class="reviewMode ? 'btn-primary' : 'btn-tinted'" :aria-pressed="reviewMode" @click="showReview(!reviewMode)">
            {{ reviewMode ? 'Back to spending' : 'Needs review' }}
          </button>
        </div>
        <p v-if="rangeProblem" class="notice notice-error" role="alert">{{ rangeProblem }}</p>
        <form class="bar-row search" role="search" @submit.prevent="find">
          <label class="visually-hidden" for="search-q">Search transactions</label>
          <input id="search-q" v-model="search.q" class="input" type="search" maxlength="100" placeholder="Search transactions" enterkeyhint="search">
          <template v-if="sizing">
            <label class="size"><span class="visually-hidden">Amount from</span><input v-model="search.min" class="input num" inputmode="decimal" placeholder="From $0"></label>
            <label class="size"><span class="visually-hidden">to</span><input v-model="search.max" class="input num" inputmode="decimal" placeholder="To any"></label>
          </template>
          <label v-if="tagData.known.length || search.tag" class="tag-pick">
            <span class="visually-hidden">Tag</span>
            <select v-model="search.tag" class="select">
              <option value="">Any tag</option>
              <option v-for="k in tagData.known" :key="k" :value="k">{{ k }}</option>
              <option v-if="search.tag && !tagData.known.includes(search.tag)" :value="search.tag">{{ search.tag }}</option>
            </select>
          </label>
          <button class="btn btn-tinted">Search</button>
          <button v-if="!sizing" type="button" class="link" @click="sizing = true">By amount</button>
          <a class="link csv" :href="csvHref" :title="`Download ${csvWhat} as a spreadsheet`" download>Download CSV</a>
        </form>
      </section>

      <SpendingAddTransaction v-model:open="adding" :accounts="list.accounts" :account="account" @added="changed" />
      <p v-if="notice" class="notice notice-success group" role="status">{{ notice }}</p>

      <p v-if="summaryError" class="notice notice-error group" role="alert">{{ errorMessage(summaryError) }}</p>

      <!-- What a search found, on any date. -->
      <template v-else-if="searching || reviewMode">
        <section class="group" aria-labelledby="found-title">
          <div class="card card-pad tight">
            <h2 id="found-title" class="title-2">{{ reviewMode ? 'Needs review' : 'Search' }}</h2>
            <p class="footnote" aria-live="polite">
              <template v-if="reviewMode">{{ txs.total.toLocaleString() }} {{ txs.total === 1 ? 'transaction' : 'transactions' }} to review<template v-if="account"> in {{ names.get(account) }}</template></template>
              <template v-else>{{ found }}<template v-if="account"> in {{ names.get(account) }}</template></template>
            </p>
            <template v-if="reviewMode && waiting.history">
              <p class="footnote">
                <template v-if="withHistory">Including {{ waiting.history.toLocaleString() }} older {{ waiting.history === 1 ? 'one' : 'ones' }} your bank links brought in from before you linked them.</template>
                <template v-else>Not counting {{ waiting.history.toLocaleString() }} older {{ waiting.history === 1 ? 'one' : 'ones' }} your bank links brought in from before you linked them. They're already in every total and search.</template>
              </p>
              <p><button class="btn btn-plain clear" @click="go({ history: withHistory ? undefined : 'true' })">{{ withHistory ? 'Leave those out' : 'Review those too' }}</button></p>
            </template>
            <p v-if="!reviewMode"><button class="btn btn-plain clear" @click="clearSearch">Clear search</button></p>
          </div>
        </section>
        <section class="group" aria-label="Transactions found">
          <p v-if="txError" class="notice notice-error" role="alert">{{ errorMessage(txError) }}</p>
          <div v-else-if="!txs.items.length" class="card card-pad">
            <p class="muted">Nothing matches. Try fewer words, or a wider amount.</p>
          </div>
          <SpendingTransactions v-else :items="txs.items" :categories="all" :names="names" :show-account="!account" :busy="pending" :review-mode="reviewMode" :known-tags="tagData.known" @changed="changed" @reviewed="markReviewed" />
          <div v-if="txs.pages > 1" class="btn-row pager">
            <button class="btn btn-plain" :disabled="page <= 1" @click="go({ page: String(page - 1) })">Newer</button>
            <span class="footnote">Page {{ txs.page }} of {{ txs.pages }}</span>
            <button class="btn btn-plain" :disabled="page >= txs.pages" @click="go({ page: String(page + 1) })">Older</button>
          </div>
          <p class="group-footer">Open one to give it a name of your own, add a note or tags, split it across categories, or leave it out of spending and taxes.</p>
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
            <p class="footnote">{{ period.label }} · {{ (current?.count ?? 0).toLocaleString() }} {{ current?.count === 1 ? 'transaction' : 'transactions' }}<template v-if="viewing?.custom"> · {{ viewing.shared ? 'Shared category' : 'Your own category' }}</template></p>
            <SpendingBudget
              v-if="viewing?.spending" :category="category" :current="current" :period-label="period.label"
              :budget="thisBudget" @changed="budgetChanged"
            />
            <template v-if="viewing?.custom && !viewing.shared">
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
          <SpendingTransactions v-else :items="txs.items" :categories="all" :names="names" :show-account="!account" :busy="pending" :known-tags="tagData.known" @changed="changed" />
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
              <div v-if="!spending.some(c => c.count)" class="card-pad stack">
                <p class="muted">No spending in {{ period.label }}. Transactions arrive when a linked bank syncs, or when you import a statement in Settings.</p>
                <NuxtLink to="/settings#accounts" class="btn btn-tinted">Go to your accounts</NuxtLink>
              </div>
              <ul v-else class="list">
                <li v-for="c in spending" :key="c.id">
                  <NuxtLink :to="{ query: { ...route.query, category: c.id, page: undefined } }" class="row cat">
                    <span class="row-label">
                      <span class="cat-head"><span class="cat-name">{{ c.label }}</span><span class="num" :class="spendTone(c.total_cents)">{{ formatCents(c.total_cents) }}</span></span>
                      <span v-if="c.budget_cents" class="bar" aria-hidden="true"><span class="bar-fill" :class="overBy(c) < 0 ? 'over' : 'under'" :style="{ width: budgetShare(c) }" /></span>
                      <span v-else class="bar" aria-hidden="true"><span class="bar-fill" :style="{ width: share(c.total_cents) }" /></span>
                      <span class="caption">
                        {{ c.count.toLocaleString() }} {{ c.count === 1 ? 'transaction' : 'transactions' }}<template v-if="c.budget_cents"> ·
                          <span v-if="overBy(c) < 0" class="loss">{{ formatCents(-overBy(c)) }} over its {{ formatCents(c.budget_cents) }} budget</span>
                          <template v-else>{{ formatCents(overBy(c)) }} left of {{ formatCents(c.budget_cents) }}</template>
                          <template v-if="c.carry_cents"> (rolled over {{ c.carry_cents > 0 ? '+' : '−' }}{{ formatCents(Math.abs(c.carry_cents)) }})</template>
                        </template>
                      </span>
                    </span>
                    <AppIcon name="chevron" class="chev" />
                  </NuxtLink>
                </li>
              </ul>
            </div>
            <p class="group-footer">Something in the wrong place? Open it and pick another category; that merchant's other transactions follow. Open a category to give it a monthly budget, or plan them all at once on <NuxtLink to="/budget">Monthly plan</NuxtLink>.</p>
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

          <section v-if="tagData.totals.length" class="group" aria-labelledby="tags-title">
            <h2 id="tags-title" class="group-title">Tags</h2>
            <ul class="card list">
              <li v-for="t in tagData.totals" :key="t.tag">
                <NuxtLink :to="{ query: { account: account || undefined, tag: t.tag } }" class="row cat">
                  <span class="row-label">
                    <span class="cat-head"><span class="cat-name">{{ t.tag }}</span><span class="num" :class="spendTone(t.out_cents)">{{ formatCents(t.out_cents) }}</span></span>
                    <span class="caption">{{ t.count.toLocaleString() }} {{ t.count === 1 ? 'transaction' : 'transactions' }} in {{ period.label }}<template v-if="t.in_cents"> · {{ formatCents(t.in_cents) }} came in</template></span>
                  </span>
                  <AppIcon name="chevron" class="chev" />
                </NuxtLink>
              </li>
            </ul>
            <p class="group-footer">Money out for each tag in {{ period.label }}. Open one to see everything with that tag, on any date. Tag a transaction by opening it.</p>
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
.tag-pick .select { width: auto; max-width: 12rem; background: var(--surface); border-color: var(--separator); }
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
/* Within budget is a neutral progress bar; over it is the fixed loss red. */
.bar-fill.under { background: var(--text-3); }
.bar-fill.over { background: var(--loss); }
.range { display: inline-flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.range .input { width: auto; background: var(--surface); border-color: var(--separator); }

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
