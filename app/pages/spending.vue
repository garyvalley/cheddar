<script setup lang="ts">
import { formatCents, type Account, type Transaction } from '~~/shared/accounts'

const route = useRoute()
const account = ref(typeof route.query.account === 'string' ? route.query.account : '')
const page = ref(1)
watch(account, () => { page.value = 1 })

const { data: list } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })
const names = computed(() => new Map(list.value.accounts.map(a => [a.id, a.name])))
const { data, pending, error } = await useFetch<{ items: Transaction[], page: number, pages: number, total: number }>('/api/transactions', {
  query: { account, page },
  default: () => ({ items: [], page: 1, pages: 0, total: 0 }),
})

const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
</script>

<template>
  <div>
    <AppHeader title="Spending">
      <NuxtLink v-if="list.accounts.length" :to="{ path: '/accounts/import', query: account ? { account } : {} }" class="btn btn-tinted">Import</NuxtLink>
    </AppHeader>

    <section v-if="!list.accounts.length" class="group">
      <div class="card card-pad stack">
        <p class="headline">No accounts yet</p>
        <p class="muted">Add your accounts, then import the files your bank lets you download. Your transactions show up here.</p>
        <NuxtLink to="/accounts" class="btn btn-primary">Add an account</NuxtLink>
      </div>
    </section>

    <template v-else>
      <section class="group">
        <div class="card">
          <label class="field">
            <span class="field-label">Account</span>
            <select v-model="account" class="select">
              <option value="">All accounts</option>
              <option v-for="a in list.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="group" aria-labelledby="tx-title">
        <h2 id="tx-title" class="group-title">Transactions<template v-if="data.total"> · {{ data.total.toLocaleString() }}</template></h2>
        <p v-if="error" class="notice notice-error" role="alert">{{ errorMessage(error) }}</p>
        <div v-else-if="!data.items.length" class="card card-pad stack">
          <p class="muted">No transactions yet. Import a statement to see them here.</p>
          <NuxtLink :to="{ path: '/accounts/import', query: account ? { account } : {} }" class="btn btn-primary">Import a statement</NuxtLink>
        </div>
        <ul v-else class="card list" :aria-busy="pending">
          <li v-for="t in data.items" :key="t.id" class="row">
            <span class="row-label">
              <span class="block desc">{{ t.description || 'No description' }}</span>
              <span class="footnote">{{ day(t.posted) }}<template v-if="!account"> · {{ names.get(t.account) }}</template><template v-if="t.pending"> · Pending</template></span>
            </span>
            <span class="num amount" :class="{ income: t.amount_cents > 0 }">{{ formatCents(t.amount_cents) }}</span>
          </li>
        </ul>
        <div v-if="data.pages > 1" class="btn-row pager">
          <button class="btn btn-plain" :disabled="page <= 1" @click="page--">Newer</button>
          <span class="footnote">Page {{ data.page }} of {{ data.pages }}</span>
          <button class="btn btn-plain" :disabled="page >= data.pages" @click="page++">Older</button>
        </div>
      </section>

      <p class="group-footer">Categories, rules and weekly and monthly reports are coming next.</p>
    </template>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.desc { overflow-wrap: anywhere; }
.amount { white-space: nowrap; }
.income { color: var(--success); }
.pager { justify-content: space-between; align-items: center; margin-top: 0.5rem; }
</style>
