<script setup lang="ts">
import { formatCents, type BankLink, type BankLinks, type SyncResult } from '~~/shared/bank-links'

// The Accounts page reads the same key, to tell linked accounts from the ones added by hand.
const { data, refresh } = await useFetch<BankLinks>('/api/bank-links', { key: 'bank-links', default: () => ({ enabled: false, links: [] }) })
/** A link was added, synced or removed, so the accounts it brings in may have changed. */
const emit = defineEmits<{ changed: [] }>()

const adding = ref(false)
const token = ref('')
const add = useAction()
const work = useAction()
const busyId = ref('')
const removingId = ref('')
const notice = ref('')

function said(r: SyncResult): string {
  if (r.recent) return 'Already up to date: it synced a few minutes ago.'
  if (!r.ok) return r.problem || 'The sync didn\'t work.'
  const parts = [`${r.added} new transaction${r.added === 1 ? '' : 's'}`]
  if (r.updated) parts.push(`${r.updated} updated`)
  if (r.removed) parts.push(`${r.removed} pending removed`)
  return `Synced: ${parts.join(', ')}.`
}

async function link() {
  const r = await add.run(() => $fetch('/api/bank-links', { method: 'POST', body: { setup_token: token.value } }))
  if (!r) return
  token.value = ''
  adding.value = false
  notice.value = said(r.sync)
  await refresh()
  emit('changed')
}

async function sync(l: BankLink) {
  busyId.value = l.id
  const r = await work.run(() => $fetch(`/api/bank-links/${l.id}/sync`, { method: 'POST' }))
  busyId.value = ''
  if (!r) return
  notice.value = said(r.sync)
  await refresh()
  emit('changed')
}

async function remove(l: BankLink) {
  busyId.value = l.id
  const ok = await work.succeed(() => $fetch(`/api/bank-links/${l.id}/remove`, { method: 'POST' }))
  busyId.value = ''
  removingId.value = ''
  if (!ok) return
  notice.value = 'Removed. Its accounts and transactions stay in Cheddar, and no longer sync.'
  await refresh()
  emit('changed')
}

function title(l: BankLink) {
  return l.institutions.length ? l.institutions.join(', ') : 'SimpleFIN link'
}

function when(pb: string) {
  if (!pb) return 'Not synced yet'
  const d = new Date(pb.replace(' ', 'T'))
  return `Synced ${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
}
</script>

<template>
  <section id="linked-banks" class="group" aria-labelledby="links-title">
    <h2 id="links-title" class="group-title">Linked banks and cards</h2>

    <div v-if="!data.enabled" class="card card-pad">
      <p class="subhead">Linking banks isn't switched on for this Cheddar yet. You can still add accounts below and import the files your bank exports.</p>
    </div>

    <template v-else>
      <div v-for="l in data.links" :key="l.id" class="card link">
        <div class="row">
          <span class="row-label">
            <span class="headline block">{{ title(l) }}</span>
            <span class="footnote block">{{ when(l.last_synced) }}</span>
          </span>
          <span v-if="l.status !== 'ok'" class="badge badge-warn">{{ l.status === 'reconnect' ? 'Link again' : 'Sync failed' }}</span>
        </div>
        <div v-for="a in l.accounts" :key="a.id" class="row">
          <span class="row-label">{{ a.name }}</span>
          <span class="row-value num">{{ formatCents(a.balance_cents) }}</span>
        </div>
        <p v-if="l.message" class="field footnote" :class="{ warn: l.status !== 'ok' }">{{ l.message }}</p>
        <div v-if="removingId === l.id" class="field stack">
          <p class="footnote">Stop syncing {{ title(l) }}? Its accounts and transactions stay. To cut SimpleFIN's own access to your bank, remove the bank in SimpleFIN too.</p>
          <div class="btn-row">
            <button class="btn btn-danger" :disabled="work.busy.value" @click="remove(l)">
              <span v-if="work.busy.value && busyId === l.id" class="spinner" aria-hidden="true" /> Remove link
            </button>
            <button class="btn btn-plain" @click="removingId = ''">Cancel</button>
          </div>
        </div>
        <div v-else class="field btn-row">
          <button class="btn btn-tinted" :disabled="work.busy.value" @click="sync(l)">
            <span v-if="work.busy.value && busyId === l.id" class="spinner" aria-hidden="true" /> Sync now
          </button>
          <button class="btn btn-plain" @click="removingId = l.id">Remove…</button>
        </div>
      </div>

      <div class="card">
        <div v-if="!adding" class="field btn-row">
          <button class="btn btn-primary" @click="adding = true; notice = ''">Link a bank or card</button>
        </div>
        <form v-else class="field stack" @submit.prevent="link">
          <ol class="steps subhead">
            <li>Sign up at <a href="https://beta-bridge.simplefin.org" target="_blank" rel="noopener noreferrer">SimpleFIN Bridge</a> ($15 a year, paid to SimpleFIN) and connect your banks and cards there.</li>
            <li>In SimpleFIN, make a new setup token for an app, and copy it.</li>
            <li>Paste it here. It works once; Cheddar keeps the read-only access it unlocks, encrypted.</li>
          </ol>
          <label>
            <span class="field-label">SimpleFIN setup token</span>
            <textarea v-model="token" v-focus class="input token" rows="3" autocomplete="off" spellcheck="false" required />
          </label>
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="add.busy.value">
              <span v-if="add.busy.value" class="spinner" aria-hidden="true" /> Link
            </button>
            <button type="button" class="btn btn-plain" @click="adding = false; token = ''; add.error.value = ''">Cancel</button>
          </div>
        </form>
      </div>
    </template>

    <p v-if="add.error.value || work.error.value" class="notice notice-error" role="alert">{{ add.error.value || work.error.value }}</p>
    <p v-else-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
    <p v-if="data.enabled" class="group-footer">Each link syncs once a day on its own. Cheddar can only read: SimpleFIN can't move money.</p>
  </section>
</template>

<style scoped>
.link { margin-bottom: 0.75rem; }
.steps { margin: 0 0 0.5rem; padding-left: 1.25rem; }
.steps li { margin-bottom: 0.25rem; }
.token { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem; word-break: break-all; resize: vertical; }
.warn { color: var(--warning); }
.badge-warn { background: color-mix(in srgb, var(--warning) 18%, var(--surface)); color: var(--warning); }
</style>
