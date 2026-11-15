<script setup lang="ts">
import { formatCents, type BankLink, type BankLinks, type LinkAnswer, type SyncResult } from '~~/shared/bank-links'

// Settings' linked banks: link, update, sign in again, unlink. The accounts a link brings in
// are listed, edited and imported into just below (SettingsAccounts), which reads the same key to mark them.
const { data, refresh } = await useFetch<BankLinks>('/api/bank-links', { key: 'bank-links', default: () => ({ enabled: false, links: [] }) })

const add = useAction()
const work = useAction()

// Linking a new bank and unlinking one want the password typed in the last
// 15 minutes (pb_hooks/sessions.pb.js): the server says so, the card below
// asks, and the step runs again once it's given.
const confirm = useAction()
const asking = ref<null | (() => void)>(null)
const password = ref('')
const wantsPassword = (e: unknown) => (e as { data?: { data?: { password?: string } } }).data?.data?.password === 'required'

/** `step`, or null when the server wants the password first: then it asks, and `again` runs once it's given. */
async function guarded<T>(step: () => Promise<T>, again: () => void): Promise<T | null> {
  try {
    return await step()
  }
  catch (e) {
    if (!wantsPassword(e)) throw e
    asking.value = again
    return null
  }
}

async function confirmPassword() {
  if (!await confirm.succeed(() => $fetch('/api/auth/confirm-password', { method: 'POST', body: { password: password.value } }))) return
  const again = asking.value
  asking.value = null
  password.value = ''
  again?.()
}

function cancelPassword() {
  asking.value = null
  password.value = ''
  confirm.error.value = ''
}
const busyId = ref('')
const removingId = ref('')
const notice = ref('')

function said(r: SyncResult): string {
  if (r.recent) return 'Already up to date: it synced a moment ago.'
  if (!r.ok) return r.problem || 'The sync didn\'t work.'
  if (!r.added && !r.updated && !r.removed) return 'Synced. Nothing new yet: a new link\'s transactions can take a few minutes to arrive, so sync again shortly.'
  const parts = [`${r.added} new transaction${r.added === 1 ? '' : 's'}`]
  if (r.updated) parts.push(`${r.updated} updated`)
  if (r.removed) parts.push(`${r.removed} removed`)
  return `Synced: ${parts.join(', ')}.`
}

/** Plaid Link's own script, from Plaid as it requires: loaded the first time someone links. */
interface PlaidHandler { open: () => void, destroy: () => void }
interface PlaidLink {
  create: (o: {
    token: string
    onSuccess: (publicToken: string, meta: { institution?: { name?: string } | null }) => void
    onExit: (err: { display_message?: string | null, error_message?: string } | null) => void
  }) => PlaidHandler
}
let plaidScript: Promise<PlaidLink> | null = null

/** An error whose message is for the person: errorMessage() shows `data.message`. */
const shown = (message: string) => Object.assign(new Error(message), { data: { message } })

function loadPlaid(): Promise<PlaidLink> {
  const w = window as unknown as { Plaid?: PlaidLink }
  if (w.Plaid) return Promise.resolve(w.Plaid)
  plaidScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    s.async = true
    s.onload = () => (w.Plaid ? resolve(w.Plaid) : reject(new Error('no Plaid')))
    s.onerror = () => {
      plaidScript = null
      reject(new Error('Plaid didn\'t load'))
    }
    document.head.appendChild(s)
  })
  return plaidScript
}

/**
 * Opens Plaid Link, where the person picks their bank and signs in to it.
 * Answers Link's public_token and the bank's name, or null if they closed it.
 */
async function signInToBank(token: string): Promise<{ publicToken: string, institution: string } | null> {
  let Plaid: PlaidLink
  try {
    Plaid = await loadPlaid()
  }
  catch {
    throw shown('Plaid didn\'t load. Check your connection, or turn off anything that blocks it, and try again.')
  }
  return new Promise((resolve, reject) => {
    const handler = Plaid.create({
      token,
      onSuccess: (publicToken, meta) => {
        handler.destroy()
        resolve({ publicToken, institution: meta.institution?.name ?? '' })
      },
      onExit: (err) => {
        handler.destroy()
        if (err) reject(shown(err.display_message || 'Your bank didn\'t finish linking. Try again.'))
        else resolve(null)
      },
    })
    handler.open()
  })
}

async function link() {
  notice.value = ''
  const r = await add.run(async () => {
    const got = await guarded(() => $fetch('/api/bank-links/link-token', { method: 'POST', body: {} }), link)
    if (!got) return null
    const done = await signInToBank(got.link_token)
    if (!done) return null
    return await $fetch<LinkAnswer>('/api/bank-links', { method: 'POST', body: { public_token: done.publicToken, institution: done.institution } })
  })
  if (!r) return
  notice.value = said(r.sync)
  await refresh()
}

/** Signs in to the bank again for a link that stopped working, then syncs it. */
async function reconnect(l: BankLink) {
  notice.value = ''
  busyId.value = l.id
  const r = await work.run(async () => {
    const { link_token } = await $fetch('/api/bank-links/link-token', { method: 'POST', body: { link: l.id } })
    if (!await signInToBank(link_token)) return null
    return await $fetch<LinkAnswer>(`/api/bank-links/${l.id}/sync`, { method: 'POST', body: { reconnected: true } })
  })
  busyId.value = ''
  if (!r) return
  notice.value = said(r.sync)
  await refresh()
}

async function sync(l: BankLink) {
  notice.value = ''
  busyId.value = l.id
  const r = await work.run(() => $fetch<LinkAnswer>(`/api/bank-links/${l.id}/sync`, { method: 'POST', body: {} }))
  busyId.value = ''
  if (!r) return
  notice.value = said(r.sync)
  await refresh()
}

async function remove(l: BankLink) {
  busyId.value = l.id
  let asked = false
  const ok = await work.succeed(async () => {
    asked = (await guarded(() => $fetch(`/api/bank-links/${l.id}/remove`, { method: 'POST' }).then(() => true), () => remove(l))) === null
  })
  busyId.value = ''
  removingId.value = ''
  if (!ok || asked) return
  notice.value = 'Unlinked. Its accounts and transactions stay in Cheddar, and no longer update.'
  await refresh()
}

// "Link a bank or card" elsewhere (Investments) comes here with ?link=1, and Plaid opens
// straight away. The query goes, so a reload doesn't open it again.
const route = useRoute()
onMounted(() => {
  if (route.query.link !== '1') return
  navigateTo({ query: { ...route.query, link: undefined }, hash: route.hash }, { replace: true })
  if (data.value.enabled && !data.value.full) link()
})

const closedDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const title = (l: BankLink) => (l.institutions.length ? l.institutions.join(', ') : 'Linked bank')

/** "Brought in 1,234 transactions, back to Jan 3, 2025. The 1,100 from before Oct 16, 2026 stay out of Needs review." */
function broughtIn(l: BankLink) {
  const b = l.brought_in
  const n = (x: number) => `${x.toLocaleString()} ${x === 1 ? 'transaction' : 'transactions'}`
  let text = `Brought in ${n(b.count)}, back to ${closedDay(b.from)}.`
  if (b.history) text += ` ${b.history === 1 ? 'The one' : `The ${b.history.toLocaleString()}`} from before ${closedDay(b.review_from)} ${b.history === 1 ? 'stays' : 'stay'} out of Needs review.`
  return text
}

function when(pb: string) {
  if (!pb) return 'Not synced yet'
  const d = new Date(pb.replace(' ', 'T'))
  return `Updated ${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
}
</script>

<template>
  <section id="linked-banks" class="group" aria-labelledby="links-title">
    <h3 id="links-title" class="group-title">Linked banks and cards</h3>

    <!-- Off until the server has its keys: say so plainly, and how it's switched on. -->
    <div v-if="!data.enabled" class="card card-pad off">
      <p class="headline">Bank linking is off on this server</p>
      <p class="footnote">Until it's on, add accounts yourself and import the statements your bank lets you download.</p>
      <details class="how">
        <summary>How to turn it on</summary>
        <p class="footnote">
          Linking lets you sign in to your bank so balances and transactions arrive on their own.
          Whoever runs this Cheddar sets <code>PLAID_CLIENT_ID</code>, <code>PLAID_SECRET</code> and <code>DATA_KEYS</code>
          and deploys again (k8s/README.md, “First deploy”, steps 6 and 9).
        </p>
      </details>
    </div>

    <template v-else>
      <div v-for="l in data.links" :key="l.id" class="card link">
        <div class="row">
          <span class="row-label">
            <span class="headline block">{{ title(l) }}</span>
            <span class="footnote block">{{ when(l.last_synced) }}</span>
          </span>
          <span v-if="l.status !== 'ok'" class="badge badge-warn">{{ l.status === 'reconnect' ? 'Sign in needed' : 'Update failed' }}</span>
        </div>
        <div v-for="a in l.accounts" :key="a.id" class="row">
          <span class="row-label">
            {{ a.name }}<span v-if="a.last4" class="footnote"> ••{{ a.last4 }}</span>
            <span v-if="a.excluded" class="badge badge-off">Not counted</span>
            <span v-if="a.closed_on" class="footnote block">Closed {{ closedDay(a.closed_on) }}</span>
          </span>
          <span class="row-value num" :class="a.balance_cents === null ? '' : moneyTone(a.balance_cents)">{{ formatCents(a.balance_cents) }}</span>
        </div>
        <p v-if="l.message" class="field footnote" :class="{ warn: l.status !== 'ok' }">{{ l.message }}</p>
        <p v-if="l.brought_in?.count" class="field footnote">
          {{ broughtIn(l) }}
          <NuxtLink v-if="l.brought_in.history" to="/spending?review=true&history=true">Review them anyway</NuxtLink>
        </p>
        <div v-if="removingId === l.id" class="field stack">
          <p class="footnote">Unlink {{ title(l) }}? Cheddar stops reading it and deletes its access. Its accounts and transactions stay.</p>
          <div class="btn-row">
            <button class="btn btn-danger" :disabled="work.busy.value" @click="remove(l)">
              <span v-if="work.busy.value && busyId === l.id" class="spinner" aria-hidden="true" /> Unlink
            </button>
            <button class="btn btn-plain" @click="removingId = ''">Cancel</button>
          </div>
        </div>
        <div v-else class="field btn-row">
          <button v-if="l.status === 'reconnect'" class="btn btn-primary" :disabled="work.busy.value" @click="reconnect(l)">
            <span v-if="work.busy.value && busyId === l.id" class="spinner" aria-hidden="true" /> Sign in again
          </button>
          <button v-else class="btn btn-tinted" :disabled="work.busy.value" @click="sync(l)">
            <span v-if="work.busy.value && busyId === l.id" class="spinner" aria-hidden="true" /> Update now
          </button>
          <button class="btn btn-plain" @click="removingId = l.id">Unlink…</button>
        </div>
      </div>

      <!-- At a limit: say so before the person signs in to their bank, not after. -->
      <p v-if="data.full" class="card card-pad footnote">{{ data.full }}</p>
      <!-- The first link is the main way in, so it gets the page's biggest button. After that, the header has one. -->
      <div v-else-if="!data.links.length" class="card card-pad first">
        <p class="headline">Link your bank, card or brokerage</p>
        <p class="footnote">
          Sign in to it, and Cheddar brings in up to two years of transactions and keeps your balances up to date.
          Your bank password goes to your bank, never to Cheddar.
        </p>
        <button class="btn btn-primary first-btn" :disabled="add.busy.value" @click="link">
          <span v-if="add.busy.value" class="spinner" aria-hidden="true" /> Link a bank or card
        </button>
        <p class="caption">No link for your bank? Add the account yourself below and import its statements.</p>
      </div>
      <div v-else class="btn-row more">
        <button class="btn btn-primary" :disabled="add.busy.value" @click="link">
          <span v-if="add.busy.value" class="spinner" aria-hidden="true" /> Link a bank or card
        </button>
      </div>
    </template>

    <form v-if="asking" class="card card-pad stack" @submit.prevent="confirmPassword">
      <label class="headline" for="bank-password">Enter your password to continue</label>
      <p class="footnote">Linking or unlinking a bank asks for it again once it's been more than 15 minutes since you last typed it.</p>
      <input id="bank-password" v-model="password" class="input" type="password" autocomplete="current-password" required>
      <p v-if="confirm.error.value" class="footnote warn" role="alert">{{ confirm.error.value }}</p>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit" :disabled="confirm.busy.value || !password">
          <span v-if="confirm.busy.value" class="spinner" aria-hidden="true" /> Continue
        </button>
        <button class="btn btn-plain" type="button" @click="cancelPassword">Cancel</button>
      </div>
    </form>

    <p v-if="add.error.value || work.error.value" class="notice notice-error" role="alert">{{ add.error.value || work.error.value }}</p>
    <p v-else-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
    <p v-if="data.enabled" class="group-footer">
      Linked accounts update on their own: within minutes of your bank having something new, and at least once a day. Cheddar can only read them: it can't move money.
      Rename, close or leave out a linked account under Your accounts, below. For history older than the link brought in, import a statement there: what the link already has is skipped.
    </p>
  </section>
</template>

<style scoped>
.off > p { margin: 0; }
.off .footnote { margin-top: 0.25rem; }
.how { margin-top: 0.5rem; }
.how summary { font-size: 0.875rem; color: var(--accent); cursor: pointer; }

.link { margin-bottom: 0.75rem; }
.first { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; }
.first > p { margin: 0; }
.first .first-btn { margin-top: 0.25rem; min-height: 3rem; padding-inline: 1.5rem; font-size: 1rem; }
.more { margin-bottom: 0.75rem; }
.badge { margin-left: 0.375rem; }
.warn { color: var(--warning); }
.off code { font-size: 0.75rem; }
.badge-warn { background: color-mix(in srgb, var(--warning) 18%, var(--surface)); color: var(--warning); }
</style>
