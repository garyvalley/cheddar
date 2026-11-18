<script setup lang="ts">
// Settings → Rules: the rules a person writes (conditions and actions,
// shared/rules.ts), and the merchant rules Cheddar learned each time they
// moved a transaction to another category, to change or forget.
import type { Account } from '~~/shared/accounts'
import { BUILT_IN, categoryLabel, type Category } from '~~/shared/categories'
import { actionWords, conditionWords, RENAME_MAX, TEXT_MAX, type MerchantRule, type Rule, type Rules } from '~~/shared/rules'
import { parseAmount } from '~~/shared/transactions'

const [
  { data, refresh },
  { data: cats },
  { data: accts },
] = await Promise.all([
  useFetch<Rules>('/api/rules', { default: () => ({ rules: [], merchant: [] }) }),
  useFetch<{ categories: Category[] }>('/api/categories', { key: 'categories', default: () => ({ categories: BUILT_IN }) }),
  useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) }),
])

// Only the person's own categories and accounts: a rule sorts only their transactions.
const categories = computed(() => cats.value.categories.filter(c => !c.shared))
const accounts = computed(() => accts.value.accounts.filter(a => a.owned !== false))
const label = (id: string) => categoryLabel(id, cats.value.categories)
const accountName = (id: string) => accts.value.accounts.find(a => a.id === id)?.name ?? 'an account'

// One form, for a new rule or the one being changed.
const editing = ref<string | null>(null) // '' for a new one
const blank = () => ({ text: '', min: '', max: '', account: '', category: '', rename: '', exclude: false, apply: true })
const form = reactive(blank())
const save = useAction()
const done = ref('')

function start(rule?: Rule) {
  save.error.value = ''
  done.value = ''
  Object.assign(form, blank())
  if (rule) {
    const dollars = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2))
    Object.assign(form, { text: rule.text, min: dollars(rule.min_cents), max: dollars(rule.max_cents), account: rule.account, category: rule.category, rename: rule.rename, exclude: rule.exclude, apply: false })
  }
  editing.value = rule?.id ?? ''
}

/** An amount box as cents, null when empty, or undefined when it isn't an amount. */
function cents(text: string): number | null | undefined {
  if (!text.trim()) return null
  const a = parseAmount(text)
  return a ? a.cents : undefined
}

async function submit() {
  const min = cents(form.min)
  const max = cents(form.max)
  if (min === undefined || max === undefined) {
    save.error.value = 'Type amounts as dollars and cents, such as 12.50.'
    return
  }
  const body = { text: form.text, min_cents: min, max_cents: max, account: form.account, category: form.category, rename: form.rename, exclude: form.exclude, apply: form.apply }
  const id = editing.value
  const r = await save.run(() => $fetch<{ applied: number }>(id ? `/api/rules/${id}` : '/api/rules', { method: id ? 'PATCH' : 'POST', body }))
  if (!r) return
  editing.value = null
  done.value = form.apply ? `Saved, and applied to ${r.applied === 1 ? '1 transaction' : `${r.applied.toLocaleString()} transactions`} you already had.` : 'Saved. It applies to transactions from now on.'
  await refresh()
}

const remove = useAction()
const deleting = ref('')
async function confirmRemove(id: string) {
  if (!await remove.run(() => $fetch(`/api/rules/${id}/remove`, { method: 'POST' }))) return
  deleting.value = ''
  await refresh()
}

// Learned merchant rules: pick another category, or forget one.
const learned = useAction()
const busyMerchant = ref('')
async function moveMerchant(rule: MerchantRule, event: Event) {
  const category = (event.target as HTMLSelectElement).value
  busyMerchant.value = rule.id
  await learned.run(() => $fetch(`/api/merchant-rules/${rule.id}`, { method: 'PATCH', body: { category } }))
  busyMerchant.value = ''
  await refresh()
}
async function forget(rule: MerchantRule) {
  busyMerchant.value = rule.id
  await learned.run(() => $fetch(`/api/merchant-rules/${rule.id}/remove`, { method: 'POST' }))
  busyMerchant.value = ''
  await refresh()
}
// "starbucks store" as "Starbucks store".
const merchantName = (m: string) => m.charAt(0).toUpperCase() + m.slice(1)
</script>

<template>
  <div>
    <section id="your-rules" class="group" aria-labelledby="your-rules-title">
      <div class="group-head">
        <h3 id="your-rules-title" class="group-title">Your rules</h3>
        <button v-if="editing === null" class="btn btn-tinted" @click="start()">Add a rule…</button>
      </div>

      <form v-if="editing !== null" class="card" aria-label="Rule" @submit.prevent="submit">
        <p class="field footnote">A transaction has to match everything you fill in under “When”.</p>
        <fieldset class="field">
          <legend class="legend">When</legend>
          <label class="sub">
            <span class="field-label">The description or payee has these words</span>
            <input v-model="form.text" v-focus class="input" :maxlength="TEXT_MAX" placeholder="netflix">
          </label>
          <div class="pair sub">
            <label>
              <span class="field-label">Amount from</span>
              <input v-model="form.min" class="input num" inputmode="decimal" placeholder="Any">
            </label>
            <label>
              <span class="field-label">to</span>
              <input v-model="form.max" class="input num" inputmode="decimal" placeholder="Any">
            </label>
          </div>
          <label class="sub">
            <span class="field-label">Account</span>
            <select v-model="form.account" class="select">
              <option value="">Any account</option>
              <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
        </fieldset>
        <fieldset class="field">
          <legend class="legend">Then</legend>
          <label class="sub">
            <span class="field-label">Category</span>
            <select v-model="form.category" class="select">
              <option value="">Leave it as it is</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </label>
          <label class="sub">
            <span class="field-label">Rename it to</span>
            <input v-model="form.rename" class="input" :maxlength="RENAME_MAX" placeholder="Keep its name">
          </label>
          <label class="check">
            <input v-model="form.exclude" type="checkbox">
            <span>Leave it out of every total</span>
          </label>
        </fieldset>
        <div class="field">
          <label class="check">
            <input v-model="form.apply" type="checkbox">
            <span>Apply it to the transactions I already have</span>
          </label>
          <span class="footnote block">Otherwise it applies to new transactions only. A category you picked by hand always stays.</span>
        </div>
        <div class="field btn-row">
          <button class="btn btn-primary" :disabled="save.busy.value">
            <span v-if="save.busy.value" class="spinner" aria-hidden="true" /> Save rule
          </button>
          <button type="button" class="btn btn-plain" @click="editing = null">Cancel</button>
        </div>
        <p v-if="save.error.value" class="field notice notice-error" role="alert">{{ save.error.value }}</p>
      </form>

      <p v-if="done" class="notice notice-success" role="status">{{ done }}</p>

      <div v-if="data.rules.length" class="card">
        <ul class="list">
          <li v-for="r in data.rules" :key="r.id" class="row rule">
            <template v-if="deleting === r.id">
              <span class="row-label footnote">Delete this rule? What it sorted is sorted again without it; names and left-out transactions stay as they are.</span>
              <button class="btn btn-plain" @click="deleting = ''">Cancel</button>
              <button class="btn btn-danger" :disabled="remove.busy.value" @click="confirmRemove(r.id)">
                <span v-if="remove.busy.value" class="spinner" aria-hidden="true" /> Delete
              </button>
            </template>
            <template v-else>
              <span class="row-label">
                <span class="block"><span class="caption when">When</span> {{ conditionWords(r, accountName) }}</span>
                <span class="block"><span class="caption when">Then</span> {{ actionWords(r, label) }}</span>
              </span>
              <span class="actions">
                <button class="act" :aria-label="`Edit the rule for ${conditionWords(r, accountName)}`" @click="start(r)">Edit</button>
                <button class="act danger" :aria-label="`Delete the rule for ${conditionWords(r, accountName)}`" @click="deleting = r.id">Delete</button>
              </span>
            </template>
          </li>
        </ul>
      </div>
      <p v-else-if="editing === null" class="card card-pad footnote">
        No rules of your own yet. A rule can sort, rename or leave out every transaction that matches it, such as each charge from one shop or every payment of one amount.
      </p>
      <p v-if="remove.error.value" class="notice notice-error" role="alert">{{ remove.error.value }}</p>
    </section>

    <section class="group" aria-labelledby="learned-title">
      <h3 id="learned-title" class="group-title">Learned from your changes</h3>
      <div v-if="data.merchant.length" class="card">
        <ul class="list">
          <li v-for="m in data.merchant" :key="m.id" class="row rule">
            <span class="row-label">{{ merchantName(m.merchant) }}</span>
            <select class="select merchant-cat" :value="m.category" :disabled="busyMerchant === m.id" :aria-label="`Category for ${merchantName(m.merchant)}`" @change="moveMerchant(m, $event)">
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
            <button class="act danger" :disabled="busyMerchant === m.id" :aria-label="`Forget the rule for ${merchantName(m.merchant)}`" @click="forget(m)">Forget</button>
          </li>
        </ul>
      </div>
      <p v-else class="card card-pad footnote">Nothing yet.</p>
      <p v-if="learned.error.value" class="notice notice-error" role="alert">{{ learned.error.value }}</p>
      <p class="group-footer">
        When you move a transaction to another category, its merchant's other transactions follow, and so do its next ones.
        Change one here to move them all, or forget it to let Cheddar sort them on its own again. Your own rules come first.
      </p>
    </section>
  </div>
</template>

<style scoped>
.group-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.group-head .group-title { margin: 0; }
fieldset { border: 0; margin: 0; min-width: 0; }
.legend { float: left; width: 100%; padding: 0; font-weight: 600; }
.legend + * { clear: both; }
.sub { display: block; margin-top: 0.75rem; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.check { display: flex; gap: 0.75rem; align-items: center; min-height: 2.75rem; }
.check input { width: 1.25rem; height: 1.25rem; accent-color: var(--accent); }
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: var(--border); }
.rule { gap: 0.75rem; }
.when { display: inline-block; min-width: 2.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
.merchant-cat { max-width: 12rem; }
.actions { display: flex; gap: 0.125rem; }
.act {
  display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 0.5rem; border: 0; background: none;
  font: inherit; font-size: 0.875rem; color: var(--accent); cursor: pointer; border-radius: var(--radius-sm);
}
.act:hover { background: var(--surface-2); }
.act.danger { color: var(--text-2); }
.act.danger:hover { color: var(--critical); }
.notice { margin-top: 0.75rem; }
@media (max-width: 560px) {
  .rule { flex-wrap: wrap; row-gap: 0; }
  .rule .row-label { flex: 1 1 100%; }
}
</style>
