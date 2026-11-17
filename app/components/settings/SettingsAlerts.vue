<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { BILL_DAYS, anyOn, type AlertSettings } from '~~/shared/alerts'

// Settings → Alerts (shared/alerts.ts): what Cheddar emails the person
// about. The hooks look every hour for charges and banks, and once a morning
// for the rest (pb_hooks/alerts.pb.js).

const { me } = useAuth()
const { data, refresh } = await useFetch<{ settings: AlertSettings }>('/api/alerts', { key: 'alerts' })
const save = useAction()
const check = useAction()
const saved = ref(false)
const checked = ref<string[] | null>(null)

const plain = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(/\.00$/, '') : '')
const form = reactive({ charge_over: '', balance_under: '', bills: false, budgets: false, banks: false, weekly: false })
watchEffect(() => {
  const s = data.value?.settings
  if (!s) return
  Object.assign(form, { ...s, charge_over: plain(s.charge_over_cents), balance_under: plain(s.balance_under_cents) })
})
const on = computed(() => !!data.value && anyOn(data.value.settings))

async function submit() {
  saved.value = false
  checked.value = null
  const r = await save.run(() => $fetch<{ settings: AlertSettings }>('/api/alerts', { method: 'PUT', body: { ...form } }))
  if (!r) return
  data.value = r
  saved.value = true
}
async function now() {
  checked.value = null
  const r = await check.run(() => $fetch<{ sent: string[] }>('/api/alerts/check', { method: 'POST' }))
  if (r) checked.value = r.sent
  await refresh()
}
</script>

<template>
  <section class="group" aria-labelledby="alerts-title">
    <h3 id="alerts-title" class="group-title">Alerts by email</h3>
    <p v-if="me && !me.verified" class="notice notice-info">Alerts go only to a confirmed address. Confirm {{ me.email }} in Sign-in and security first, and they'll start.</p>
    <form class="card" @submit.prevent="submit" @input="saved = false">
      <label class="field">
        <span class="field-label">A charge of at least</span>
        <span class="money-input"><span aria-hidden="true">$</span><input v-model="form.charge_over" class="input num" inputmode="decimal" placeholder="Off" aria-describedby="alerts-charge-help"></span>
        <span id="alerts-charge-help" class="footnote block">Looked for every hour, on the accounts you own.</span>
      </label>
      <label class="field">
        <span class="field-label">A checking or savings balance under</span>
        <span class="money-input"><span aria-hidden="true">$</span><input v-model="form.balance_under" class="input num" inputmode="decimal" placeholder="Off"></span>
      </label>
      <fieldset class="field checks">
        <legend class="field-label">And these</legend>
        <label class="check"><input v-model="form.bills" type="checkbox"><span>Bills and planned payments due in the next {{ BILL_DAYS }} days</span></label>
        <label class="check"><input v-model="form.budgets" type="checkbox"><span>A budget passed this month</span></label>
        <label class="check"><input v-model="form.banks" type="checkbox"><span>A bank that needs you to sign in again, or has stopped syncing</span></label>
        <label class="check"><input v-model="form.weekly" type="checkbox"><span>A summary of the week, on Monday mornings</span></label>
      </fieldset>
      <div class="field btn-row">
        <button class="btn btn-primary" :disabled="save.busy.value"><span v-if="save.busy.value" class="spinner" aria-hidden="true" /> Save</button>
        <button v-if="on" type="button" class="btn btn-plain" :disabled="check.busy.value" @click="now"><span v-if="check.busy.value" class="spinner" aria-hidden="true" /> Check now</button>
        <span v-if="saved" class="saved footnote" role="status">Saved</span>
      </div>
      <p v-if="checked" class="field footnote" role="status">
        <template v-if="checked.length">Emailed {{ checked.length === 1 ? 'one alert' : `${checked.length} alerts` }}: {{ checked.join(' ') }}</template>
        <template v-else>Nothing new to tell you about.</template>
      </p>
    </form>
    <p v-if="save.error.value || check.error.value" class="notice notice-error" role="alert">{{ save.error.value || check.error.value }}</p>
    <p class="group-footer">
      Alerts go to {{ me?.email || 'your email address' }}, each one once, together in one email when there are several.
      Balances, bills, budgets and the weekly summary are looked at once a morning; charges and banks every hour.
      <template v-if="data && data.settings.charge_over_cents">You'll hear about charges of {{ formatCents(data.settings.charge_over_cents) }} or more.</template>
    </p>
  </section>
</template>

<style scoped>
.saved { align-self: center; color: var(--success); }
.checks { display: flex; flex-direction: column; gap: 0.625rem; border: 0; margin: 0; min-width: 0; }
.checks legend { padding: 0; margin-bottom: 0.5rem; float: left; width: 100%; }
.money-input { display: flex; align-items: center; gap: 0.375rem; max-width: 14rem; }
</style>
