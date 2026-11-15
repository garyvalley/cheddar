<script setup lang="ts">
import type { BankLinks, LinkAnswer } from '~~/shared/bank-links'
import { linkHealth, needsAttention, type LinkHealth } from '~~/shared/link-health'

// Overview's linked banks: whether what the page shows is current. Healthy
// links are one quiet line (with each bank's last update and each account's
// balance date a tap away); a link that's out of date, failed, or wants the
// bank's sign-in again is listed with what to do about it (shared/link-health.ts).
const { data, refresh } = await useFetch<BankLinks>('/api/bank-links', { key: 'bank-links', default: () => ({ enabled: false, links: [] }) })
const today = useToday()
const now = ref(Date.now())
// Times are written in this browser's zone, so only once it's running (the server's is UTC).
const mounted = ref(false)
onMounted(() => { now.value = Date.now(); mounted.value = true })
const health = computed(() => linkHealth(data.value.links, now.value, today))
const problems = computed(() => needsAttention(health.value))

const work = useAction()
const busyId = ref('')
const notice = ref('')
async function retry(h: LinkHealth) {
  notice.value = ''
  busyId.value = h.id
  const r = await work.run(() => $fetch<LinkAnswer>(`/api/bank-links/${h.id}/sync`, { method: 'POST', body: {} }))
  busyId.value = ''
  if (!r) return
  await refresh()
  now.value = Date.now()
  if (r.sync.recent) notice.value = `${h.name} was just asked for an update. Try again in a couple of minutes.`
  else notice.value = r.sync.ok ? `${h.name} is up to date.` : (r.sync.problem || 'The update didn\'t work.')
}

function updated(pb: string) {
  if (!pb) return 'Never updated'
  if (!mounted.value) return 'Last updated'
  const d = new Date(pb.replace(' ', 'T'))
  const sameDay = d.toLocaleDateString('en-CA') === today
  return `Last updated ${sameDay ? d.toLocaleTimeString(undefined, { timeStyle: 'short' }) : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
}
const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const why = (h: LinkHealth) => {
  if (h.state === 'reconnect') return h.message || 'Your bank wants you to sign in again.'
  if (h.state === 'error') return h.message || 'The last update failed.'
  const old = h.accounts.filter(a => a.stale)
  if (old.length) return `${old.map(a => `${a.name}'s balance is ${a.balance_date ? `from ${day(a.balance_date)}` : 'missing'}`).join('; ')}.`
  return `${updated(h.last_synced)}: it hasn't updated in over a day.`
}
const label = { reconnect: 'Sign in needed', error: 'Update failed', stale: 'Out of date', ok: 'Up to date' }
</script>

<template>
  <section v-if="health.length" class="group" aria-labelledby="health-title">
    <div class="card">
      <div class="panel-head">
        <h2 id="health-title" class="panel-title">Linked banks</h2>
        <NuxtLink to="/settings#linked-banks" class="panel-link">Settings</NuxtLink>
      </div>
      <div v-for="h in problems" :key="h.id" class="row problem" :data-test="`health-${h.state}`">
        <span class="row-label">
          <span class="step-label">{{ h.name }} <span class="badge badge-warn">{{ label[h.state] }}</span></span>
          <span class="footnote block">{{ why(h) }} Net worth and the totals below may be behind.</span>
        </span>
        <NuxtLink v-if="h.state === 'reconnect'" :to="{ path: '/settings', query: { reconnect: h.id }, hash: '#linked-banks' }" class="btn btn-tinted">Sign in again</NuxtLink>
        <button v-else class="btn btn-tinted" :disabled="work.busy.value" @click="retry(h)">
          <span v-if="work.busy.value && busyId === h.id" class="spinner" aria-hidden="true" /> {{ h.state === 'error' ? 'Try again' : 'Update now' }}
        </button>
      </div>
      <details class="row all">
        <summary>
          <span v-if="!problems.length" data-test="health-ok">{{ health.length === 1 ? 'Your linked bank is' : `All ${health.length} linked banks are` }} up to date.</span>
          <span v-else>{{ health.length - problems.length }} of {{ health.length }} linked banks up to date.</span>
          <span class="footnote"> Each bank's last update and balance dates</span>
        </summary>
        <ul class="list">
          <li v-for="h in health" :key="h.id">
            <span class="step-label">{{ h.name }}</span>
            <span class="footnote block">{{ label[h.state] }} · {{ updated(h.last_synced) }}</span>
            <span v-for="a in h.accounts" :key="a.id" class="footnote block acct" :class="{ warn: a.stale }">
              {{ a.name }}<template v-if="a.last4"> ••{{ a.last4 }}</template>: balance {{ a.balance_date ? `as of ${day(a.balance_date)}` : 'not in yet' }}
            </span>
          </li>
        </ul>
      </details>
      <p v-if="work.error.value" class="field footnote warn" role="alert">{{ work.error.value }}</p>
      <p v-else-if="notice" class="field footnote" role="status">{{ notice }}</p>
    </div>
  </section>
</template>

<style scoped>
.problem { flex-wrap: wrap; }
.problem .btn { flex: none; }
.step-label { display: block; color: var(--text); }
.all { display: block; }
.all summary { cursor: pointer; color: var(--text-2); font-size: 0.9375rem; }
.list { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.75rem; }
.acct { padding-left: 0.75rem; }
.warn { color: var(--warning); font-weight: 600; }
</style>
