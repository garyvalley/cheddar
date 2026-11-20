<script setup lang="ts">
import { NOTICE_KINDS, type NoticeKind } from '~~/shared/notices'

// Settings → Alerts → In the bell (shared/notices.ts): which kinds of
// notice the bell in the top bar lists. Every kind is on until turned off.

const { data } = await useFetch<{ off: NoticeKind[] }>('/api/notices/settings', { default: () => ({ off: [] }) })
const save = useAction()
const saved = ref(false)
const shown = reactive<Record<string, boolean>>({})
watchEffect(() => {
  for (const k of NOTICE_KINDS) shown[k.id] = !data.value.off.includes(k.id)
})

async function submit() {
  saved.value = false
  const off = NOTICE_KINDS.filter(k => !shown[k.id]).map(k => k.id)
  const r = await save.run(() => $fetch<{ off: NoticeKind[] }>('/api/notices/settings', { method: 'PUT', body: { off } }))
  if (!r) return
  data.value = r
  saved.value = true
  // The bell follows at once.
  await refreshNuxtData('notices')
}
</script>

<template>
  <section class="group" aria-labelledby="bell-settings-title">
    <h3 id="bell-settings-title" class="group-title">In the bell</h3>
    <form class="card" @submit.prevent="submit" @change="saved = false">
      <fieldset class="field checks">
        <legend class="field-label">The bell at the top lists</legend>
        <label v-for="k in NOTICE_KINDS" :key="k.id" class="check"><input v-model="shown[k.id]" type="checkbox"><span>{{ k.label }}</span></label>
      </fieldset>
      <div class="field btn-row">
        <button class="btn btn-primary" :disabled="save.busy.value"><span v-if="save.busy.value" class="spinner" aria-hidden="true" /> Save</button>
        <span v-if="saved" class="saved footnote" role="status">Saved</span>
      </div>
    </form>
    <p v-if="save.error.value" class="notice notice-error" role="alert">{{ save.error.value }}</p>
    <p class="group-footer">The bell's number counts what you haven't seen; opening it marks them seen. Nothing is emailed from here: that's Alerts by email, above.</p>
  </section>
</template>

<style scoped>
.saved { align-self: center; color: var(--success); }
.checks { display: flex; flex-direction: column; gap: 0.625rem; border: 0; margin: 0; min-width: 0; }
.checks legend { padding: 0; margin-bottom: 0.5rem; float: left; width: 100%; }
</style>
