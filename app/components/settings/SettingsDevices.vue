<script setup lang="ts">
// The devices signed in to this account (pb_hooks/sessions.pb.js): each full
// sign-in is one, and any of them can be signed out from here.
interface DeviceSession { id: string, device: string, place: string, signed_in: number, last_used: number, current: boolean }

const { me } = useAuth()
// Read in the browser: times and places are shown in the person's own zone and language.
const { data, refresh, status } = useFetch<{ sessions: DeviceSession[] }>('/api/auth/sessions', { server: false, default: () => ({ sessions: [] }) })
const end = useAction()
const endingId = ref('')

const where = (code: string) => {
  if (!code) return ''
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code
  }
  catch {
    return code
  }
}

function when(ms: number) {
  const d = new Date(ms)
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (Date.now() - ms < 10 * 60_000) return 'Active now'
  if (days < 1) return `Last used ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  return `Last used ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

async function signOut(s: DeviceSession) {
  endingId.value = s.id
  const ok = await end.succeed(() => $fetch(`/api/auth/sessions/${s.id}/end`, { method: 'POST' }))
  endingId.value = ''
  if (!ok) return
  if (s.current) {
    me.value = null
    await navigateTo('/login')
    return
  }
  await refresh()
}
</script>

<template>
  <section class="group" aria-labelledby="devices-title">
    <h2 id="devices-title" class="group-title">Your devices</h2>
    <div class="card">
      <div v-for="s in data.sessions" :key="s.id" class="row">
        <span class="row-label">
          <span class="block">{{ s.device || 'A browser' }}<span v-if="s.current" class="badge badge-off">This device</span></span>
          <span class="footnote block">{{ [where(s.place), when(s.last_used)].filter(Boolean).join(' · ') }}</span>
        </span>
        <button class="btn btn-plain" :disabled="end.busy.value" :aria-label="`Sign out ${s.device}${s.current ? ', this device' : ''}`" @click="signOut(s)">
          <span v-if="end.busy.value && endingId === s.id" class="spinner" aria-hidden="true" /> Sign out
        </button>
      </div>
      <p v-if="status !== 'success' && !data.sessions.length" class="row footnote">Loading…</p>
    </div>
    <p v-if="end.error.value" class="notice notice-error" role="alert">{{ end.error.value }}</p>
    <p class="group-footer">
      Each device stays signed in for up to 30 days, then asks for your password and code again.
      Signing out one ends it at once.
    </p>
  </section>
</template>

<style scoped>
.badge { margin-left: 0.375rem; }
</style>
