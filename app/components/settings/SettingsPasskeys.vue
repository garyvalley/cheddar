<script setup lang="ts">
import { PASSKEY_NAME_MAX, type Passkey, type PasskeyOptions } from '~~/shared/passkeys'

// Settings → Sign-in and security → Passkeys (shared/passkeys.ts): sign in
// with Face ID, Touch ID or a security key instead of the password and the
// code. Adding one asks for the password, as setting up an app does.

const { data, refresh } = await useFetch<{ passkeys: Passkey[] }>('/api/passkeys', { key: 'passkeys', default: () => ({ passkeys: [] }) })
const { busy, error, run, succeed } = useAction()
const supported = ref(true)
onMounted(() => { supported.value = passkeysSupported() })

// 'idle' -> 'password' (confirm it's you, name it) -> the device asks -> 'idle'
const stage = ref<'idle' | 'password'>('idle')
const password = ref('')
const name = ref('')
const added = ref('')
const removing = ref('')

function guessName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android phone'
  if (/Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Passkey'
}
function begin() {
  error.value = ''
  added.value = ''
  password.value = ''
  name.value = guessName()
  stage.value = 'password'
}
async function add() {
  const opts = await run(() => $fetch<PasskeyOptions>('/api/passkeys/options', { method: 'POST', body: { password: password.value } }))
  if (!opts) return
  password.value = ''
  let credential
  try {
    credential = await makePasskey(opts.publicKey)
  }
  catch (e) {
    error.value = passkeyProblem(e)
    return
  }
  const r = await run(() => $fetch<{ passkey: Passkey }>('/api/passkeys', { method: 'POST', body: { challengeId: opts.challengeId, name: name.value, credential } }))
  if (!r) return
  stage.value = 'idle'
  added.value = r.passkey.name
  await refresh()
}
async function remove(p: Passkey) {
  if (!await succeed(() => $fetch(`/api/passkeys/${p.id}/remove`, { method: 'POST' }))) return
  removing.value = ''
  await refresh()
}
const when = (d: string) => (d ? new Date(d.replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
</script>

<template>
  <section class="group" aria-labelledby="passkeys-title">
    <h3 id="passkeys-title" class="group-title">Passkeys</h3>
    <div class="card">
      <div v-for="p in data.passkeys" :key="p.id" class="row">
        <span class="row-label">
          <span class="block">{{ p.name }}</span>
          <span class="footnote">Added {{ when(p.created) }}<template v-if="p.last_used"> · last used {{ when(p.last_used) }}</template></span>
        </span>
        <template v-if="removing === p.id">
          <button type="button" class="btn btn-danger" :disabled="busy" @click="remove(p)">Remove</button>
          <button type="button" class="btn btn-plain" @click="removing = ''">Keep</button>
        </template>
        <button v-else type="button" class="btn btn-plain" :aria-label="`Remove ${p.name}`" @click="removing = p.id">Remove…</button>
      </div>

      <div v-if="stage === 'idle'" class="field btn-row">
        <button class="btn" :class="data.passkeys.length ? 'btn-tinted' : 'btn-primary'" :disabled="!supported" @click="begin">Add a passkey</button>
        <span v-if="added" class="saved footnote" role="status">{{ added }} added</span>
      </div>

      <form v-else class="field stack" @submit.prevent="add">
        <label>
          <span class="field-label">Name it, so you know which device it's on</span>
          <input v-model="name" class="input" :maxlength="PASSKEY_NAME_MAX" required>
        </label>
        <label>
          <span class="field-label">Enter your password to continue</span>
          <input v-model="password" v-focus class="input" type="password" autocomplete="current-password" required>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" :disabled="busy">
            <span v-if="busy" class="spinner" aria-hidden="true" /> Continue
          </button>
          <button type="button" class="btn btn-plain" @click="stage = 'idle'">Cancel</button>
        </div>
      </form>
    </div>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p class="group-footer">
      <template v-if="!supported">This browser can't use passkeys.</template>
      A passkey signs you in with Face ID, Touch ID, your PIN or a security key, with no password or code to type, and it only works on Cheddar's own site, so a fake sign-in page can't use it.
      Your authenticator app and recovery codes still work too.
    </p>
  </section>
</template>

<style scoped>
.saved { align-self: center; color: var(--success); }
</style>
