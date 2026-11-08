<script setup lang="ts">
import { encode } from 'uqr'

/** Emitted once the recovery codes are saved: two-step sign-in is on. */
const emit = defineEmits<{ done: [] }>()

const { me } = useAuth()
const { busy, error, run } = useAction()

// 'idle' -> 'password' (confirm it's you) -> 'scan' -> 'codes' (shown once)
type Stage = 'idle' | 'password' | 'scan' | 'codes'
const stage = ref<Stage>('idle')
const intent = ref<'setup' | 'codes'>('setup')
const password = ref('')
const code = ref('')
const secret = ref('')
const qr = ref('')
const qrSize = ref(0)
const recoveryCodes = ref<string[]>([])

const { data: status, refresh } = await useFetch('/api/auth/two-step', { default: () => ({ method: 'off', recovery_codes_left: 0 }) })
const on = computed(() => status.value.method === 'app')

function begin(what: typeof intent.value) {
  intent.value = what
  password.value = ''
  error.value = ''
  stage.value = 'password'
}

function cancel() {
  stage.value = 'idle'
  password.value = ''
  code.value = ''
  error.value = ''
}

async function withPassword() {
  const body = { password: password.value }
  if (intent.value === 'setup') {
    const r = await run(() => $fetch('/api/auth/two-step/app', { method: 'POST', body }))
    if (!r) return
    secret.value = r.secret
    // Drawn here from the otpauth address: the secret never leaves for a
    // third-party QR service. One path, a unit square per dark module.
    const { data, size } = encode(r.uri, { border: 1 })
    qrSize.value = size
    qr.value = data.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : ''))).join('')
    stage.value = 'scan'
  }
  else {
    const r = await run(() => $fetch('/api/auth/two-step/recovery-codes', { method: 'POST', body }))
    if (!r) return
    recoveryCodes.value = r.recovery_codes
    stage.value = 'codes'
  }
  password.value = ''
}

async function confirm() {
  const r = await run(() => $fetch('/api/auth/two-step/app/confirm', { method: 'POST', body: { code: code.value } }))
  if (!r) return
  recoveryCodes.value = r.recovery_codes
  code.value = ''
  if (me.value) me.value = { ...me.value, mfa_enabled: true }
  stage.value = 'codes'
  await refresh()
}

async function doneWithCodes() {
  recoveryCodes.value = []
  secret.value = ''
  qr.value = ''
  await refresh()
  stage.value = 'idle'
  emit('done')
}
</script>

<template>
  <section class="group" aria-labelledby="twostep-title">
    <h2 id="twostep-title" class="group-title">Two-step sign-in</h2>
    <div class="card">
      <div class="row">
        <span class="row-label">Authenticator app</span>
        <span class="badge" :class="on ? 'badge-on' : 'badge-off'">{{ on ? 'On' : 'Off' }}</span>
      </div>

      <div v-if="stage === 'idle'" class="field btn-row">
        <button v-if="!on" class="btn btn-primary" @click="begin('setup')">Turn on</button>
        <template v-else>
          <button class="btn btn-tinted" @click="begin('setup')">Use a different app</button>
          <button class="btn btn-tinted" @click="begin('codes')">New recovery codes</button>
        </template>
      </div>

      <form v-else-if="stage === 'password'" class="field stack" @submit.prevent="withPassword">
        <label>
          <span class="field-label">Enter your password to continue</span>
          <input v-model="password" v-focus class="input" type="password" autocomplete="current-password" required>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" :disabled="busy">
            <span v-if="busy" class="spinner" aria-hidden="true" /> Continue
          </button>
          <button type="button" class="btn btn-plain" @click="cancel">Cancel</button>
        </div>
      </form>

      <form v-else-if="stage === 'scan'" class="field stack" @submit.prevent="confirm">
        <p>Scan this with your authenticator app (Passwords on iPhone, Google Authenticator, 1Password…), then enter the code it shows.</p>
        <svg class="qr" :viewBox="`0 0 ${qrSize} ${qrSize}`" role="img" aria-label="QR code for your authenticator app" shape-rendering="crispEdges">
          <rect :width="qrSize" :height="qrSize" fill="#fff" />
          <path :d="qr" fill="#000" />
        </svg>
        <details>
          <summary class="footnote">Can't scan? Enter this key instead</summary>
          <code class="secret">{{ secret }}</code>
        </details>
        <label>
          <span class="field-label">6-digit code</span>
          <input v-model="code" class="input code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\d{6}" required>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" :disabled="busy">
            <span v-if="busy" class="spinner" aria-hidden="true" /> Turn on
          </button>
          <button type="button" class="btn btn-plain" @click="cancel">Cancel</button>
        </div>
      </form>

      <div v-else class="field stack">
        <p class="headline">Save your recovery codes</p>
        <p class="subhead">If you lose your phone, each of these signs you in once. This is the only time they're shown: keep them somewhere safe, like your password manager.</p>
        <ul class="codes num">
          <li v-for="c in recoveryCodes" :key="c">{{ c }}</li>
        </ul>
        <button class="btn btn-primary" @click="doneWithCodes">I've saved them</button>
      </div>
    </div>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p class="group-footer">
      <template v-if="on">{{ status.recovery_codes_left }} recovery codes left.</template>
      <template v-else>Someone who learns your password still can't get in without your phone.</template>
    </p>
  </section>
</template>

<style scoped>
.qr { display: block; width: 12rem; height: 12rem; border-radius: var(--radius-sm); }
.secret { display: block; margin-top: 0.5rem; word-break: break-all; font-size: 0.9375rem; }
.codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem 1rem; margin: 0; padding: 0; list-style: none; font-size: 1.0625rem; }
</style>
