<script setup lang="ts">
import type { Notice, NoticeKind } from '~~/shared/notices'

// The bell in the top bar (shared/notices.ts): what changed or needs the
// person, worked out by GET /api/notices. The badge counts the ones not seen
// yet; opening the list marks what it shows as seen, and those stay tinted as
// new until it's closed. It loads after the page, and again when the
// window comes back into view and every few minutes, so it never holds a
// page up.

interface Notices { notices: Notice[], unseen: string[], off: NoticeKind[] }

const { data, refresh } = useFetch<Notices>('/api/notices', {
  key: 'notices', lazy: true, server: false,
  default: () => ({ notices: [], unseen: [], off: [] }),
})

const open = ref(false)
// The ones that were new as the list opened: shown with a dot while it's open.
const fresh = ref(new Set<string>())
const count = computed(() => data.value.unseen.length)
const label = computed(() => (count.value ? `Notifications, ${count.value} new` : 'Notifications'))

const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)

async function toggle() {
  if (open.value) return close()
  open.value = true
  fresh.value = new Set(data.value.unseen)
  if (!count.value) return
  const keys = data.value.notices.map(n => n.key)
  data.value = { ...data.value, unseen: [] }
  // Best effort: if it fails, the badge comes back on the next look.
  await $fetch('/api/notices/seen', { method: 'POST', body: { keys } }).catch(() => undefined)
}
function close(focus = false) {
  open.value = false
  fresh.value = new Set()
  if (focus) button.value?.focus()
}

// Looked at again when the window comes back, at most once a minute, and every five minutes.
let last = Date.now()
function again() {
  if (document.visibilityState !== 'visible' || Date.now() - last < 60_000 || open.value) return
  last = Date.now()
  refresh()
}
let timer: ReturnType<typeof setInterval> | undefined
function outside(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) close()
}
onMounted(() => {
  document.addEventListener('visibilitychange', again)
  window.addEventListener('focus', again)
  document.addEventListener('click', outside)
  timer = setInterval(() => { last = 0; again() }, 5 * 60_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', again)
  window.removeEventListener('focus', again)
  document.removeEventListener('click', outside)
  clearInterval(timer)
})
// Going somewhere closes it.
const route = useRoute()
watch(() => route.fullPath, () => close())

const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
</script>

<template>
  <div ref="root" class="bell" @keydown.esc="close(true)">
    <button
      ref="button" class="bell-btn" :class="{ on: open }" :aria-label="label" :title="label"
      :aria-expanded="open" aria-controls="bell-panel" aria-haspopup="true" @click="toggle"
    >
      <AppIcon name="bell" />
      <span v-if="count" class="badge-count num" aria-hidden="true" data-test="bell-count">{{ count > 9 ? '9+' : count }}</span>
    </button>

    <div v-if="open" id="bell-panel" class="panel" role="region" aria-labelledby="bell-title">
      <div class="panel-head">
        <h2 id="bell-title" class="panel-title">Notifications</h2>
        <NuxtLink to="/settings#alerts" class="panel-link">Choose what shows</NuxtLink>
      </div>
      <ul v-if="data.notices.length" class="items">
        <li v-for="n in data.notices" :key="n.key">
          <NuxtLink :to="n.href" class="item" :class="{ fresh: fresh.has(n.key) }" :data-kind="n.kind">
            <span class="dot" :class="n.tone" aria-hidden="true" />
            <span class="row-label">
              <span class="item-title"><span v-if="fresh.has(n.key)" class="visually-hidden">New: </span>{{ n.title }}</span>
              <span class="footnote item-text">{{ n.text }}</span>
            </span>
            <!-- A bill's title already says when. -->
            <span v-if="n.on && n.kind !== 'bill'" class="caption when">{{ day(n.on) }}</span>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="empty muted">You're all caught up. Bills, bank problems, budgets passed and new transactions show up here.</p>
    </div>
  </div>
</template>

<style scoped>
.bell { position: relative; }
.bell-btn {
  position: relative; display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 0.625rem;
  border: 0; border-radius: var(--radius-sm); background: none; color: var(--on-bar-2); cursor: pointer;
}
.bell-btn:hover { color: var(--on-bar); background: rgb(255 255 255 / 12%); }
.bell-btn.on { color: var(--on-bar); background: rgb(255 255 255 / 16%); }
.bell-btn :deep(.icon) { width: 1.25rem; height: 1.25rem; }
.bell-btn:focus-visible { outline-color: var(--on-bar); }
/* White on the bar, with the bar's colour for the number: readable in every theme, and not a money colour. */
.badge-count {
  position: absolute; top: 0.3rem; right: 0.2rem; min-width: 1.125rem; height: 1.125rem; padding: 0 0.3rem;
  border-radius: 999px; background: var(--on-bar); color: var(--bar); box-shadow: 0 0 0 2px var(--bar);
  font-size: 0.6875rem; font-weight: 700; line-height: 1.125rem; text-align: center;
}

.panel {
  position: absolute; right: 0; top: calc(100% + 0.375rem); z-index: 20;
  width: min(24rem, calc(100vw - 1rem)); max-height: min(32rem, calc(100dvh - var(--topbar-h) - 1rem)); overflow-y: auto;
  background: var(--surface); color: var(--text); border: var(--border); border-radius: var(--radius);
  box-shadow: 0 12px 32px rgb(0 0 0 / 18%);
}
.panel-head { position: sticky; top: 0; background: var(--surface); }
.panel :focus-visible { outline-color: var(--accent); }
.items { list-style: none; margin: 0; padding: 0; }
.items > li + li { border-top: var(--border); }
.item { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem 1rem; color: var(--text); }
.item:hover { background: var(--fill, color-mix(in srgb, var(--text) 5%, var(--surface))); text-decoration: none; }
.item-title { display: block; font-weight: 600; line-height: 1.35; }
.item-text { display: block; margin-top: 0.125rem; line-height: 1.4; }
/* New since the bell was last opened: a light tint, and "New:" for screen readers. */
.item.fresh { background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }
.dot { flex: none; width: 0.625rem; height: 0.625rem; margin-top: 0.375rem; border-radius: 50%; background: var(--accent); }
.dot.warn { background: var(--warning); }
.dot.good { background: var(--success); }
.when { flex: none; margin-top: 0.125rem; color: var(--text-3); }
.empty { padding: 1rem; margin: 0; }

/* A phone: the list spans the screen under the bar. */
@media (max-width: 767px) {
  .panel { position: fixed; left: 0.5rem; right: 0.5rem; top: calc(3.25rem + 0.375rem); width: auto; max-height: calc(100dvh - 3.25rem - var(--tabbar-h) - 1.5rem); }
}
</style>
