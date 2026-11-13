<script setup lang="ts">
import { FILING_STATUSES } from '~~/shared/filing-status'
import { STATES } from '~~/shared/states'
import { deviceTimeZone, timeZoneChoices, timeZoneLabel } from '~~/shared/time-zone'

const { me } = useAuth()
const { busy, error, run } = useAction()
const saved = ref(false)

const form = reactive({
  name: me.value?.name ?? '',
  state: me.value?.state ?? '',
  filing_status: me.value?.filing_status ?? '',
  time_zone: me.value?.time_zone || '',
})
// The zones come from the browser's own list (the server's may differ), so
// until it's mounted the list holds only the saved one.
const mounted = ref(false)
const zones = computed(() => mounted.value
  ? timeZoneChoices(form.time_zone)
  : form.time_zone ? [{ zone: form.time_zone, label: timeZoneLabel(form.time_zone) }] : [])
onMounted(() => {
  mounted.value = true
  if (!form.time_zone) form.time_zone = deviceTimeZone()
})

async function save() {
  saved.value = false
  const r = await run(() => $fetch('/api/profile', { method: 'PATCH', body: { ...form } }))
  if (!r) return
  me.value = r.me
  saved.value = true
}
</script>

<template>
  <section class="group" aria-labelledby="profile-title">
    <h2 id="profile-title" class="group-title">Profile</h2>
    <form class="card" @submit.prevent="save" @input="saved = false">
      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="form.name" class="input" autocomplete="name" maxlength="100">
      </label>
      <label class="field">
        <span class="field-label">State you file taxes in</span>
        <select v-model="form.state" class="select">
          <option value="">Not chosen</option>
          <option v-for="s in STATES" :key="s.code" :value="s.code">{{ s.name }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Federal filing status</span>
        <select v-model="form.filing_status" class="select">
          <option value="">Not chosen</option>
          <option v-for="f in FILING_STATUSES" :key="f.value" :value="f.value">{{ f.label }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Time zone</span>
        <select v-model="form.time_zone" class="select">
          <option v-if="!form.time_zone" value="">Not chosen</option>
          <option v-for="z in zones" :key="z.zone" :value="z.zone">{{ z.label }}</option>
        </select>
      </label>
      <div class="field btn-row">
        <button class="btn btn-primary" :disabled="busy">
          <span v-if="busy" class="spinner" aria-hidden="true" /> Save
        </button>
        <span v-if="saved" class="saved footnote" role="status">Saved</span>
      </div>
    </form>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p class="group-footer">Your state and filing status decide which tax rules and limits Cheddar uses for you. Your time zone decides when your day, month and tax year end.</p>
  </section>
</template>

<style scoped>
.saved { align-self: center; color: var(--success); }
</style>
