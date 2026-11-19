<script setup lang="ts">
import type { PasskeyOptions } from '~~/shared/passkeys'
import type { SignUpMode } from '~~/shared/sign-up'

definePageMeta({ layout: 'auth', guestOnly: true })
useHead({ title: 'Sign in' })

const route = useRoute()
const { me } = useAuth()
const { busy, error, run } = useAction()

const email = ref('')
const password = ref('')
const code = ref('')
// Set once the password is right on an account with two-step sign-in.
const mfaId = ref('')
const notice = ref('')

async function finish(who: typeof me.value, recoveryCodesLeft?: number) {
  me.value = who
  if (recoveryCodesLeft !== undefined) {
    // Using a recovery code is worth a word: they run out.
    notice.value = `Recovery code used. ${recoveryCodesLeft} left.`
  }
  await navigateTo(safeNext(route.query.next))
}

async function signIn() {
  const r = await run(() => $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } }))
  if (!r) return
  if ('twoStep' in r && r.twoStep) {
    mfaId.value = r.twoStep.mfaId
    return
  }
  if ('me' in r) await finish(r.me)
}

async function sendCode() {
  const r = await run(() => $fetch('/api/auth/code', { method: 'POST', body: { mfaId: mfaId.value, code: code.value } }))
  if (r) await finish(r.me, r.recoveryCodesLeft)
}

// A passkey: on its own, or in place of the code after the password.
const canPasskey = ref(false)
onMounted(() => { canPasskey.value = passkeysSupported() })
async function passkey() {
  error.value = ''
  const opts = await run(() => $fetch<PasskeyOptions>('/api/auth/passkey/options', { method: 'POST' }))
  if (!opts) return
  let credential
  try {
    credential = await signWithPasskey(opts.publicKey)
  }
  catch (e) {
    error.value = passkeyProblem(e)
    return
  }
  const r = await run(() => $fetch('/api/auth/passkey', { method: 'POST', body: { challengeId: opts.challengeId, credential, mfaId: mfaId.value } }))
  if (r) await finish(r.me)
}

// A Cheddar that takes no new accounts doesn't offer to make one.
const { data: signUp } = await useFetch<{ mode: SignUpMode }>('/api/auth/sign-up', { key: 'sign-up', default: () => ({ mode: 'open' as SignUpMode }) })
</script>

<template>
  <div>
    <form v-if="!mfaId" class="stack" @submit.prevent="signIn">
      <h1 class="title-2 center">Sign in</h1>
      <div class="card">
        <label class="field">
          <span class="field-label">Email</span>
          <input v-model="email" v-focus class="input" type="email" autocomplete="username" required>
        </label>
        <label class="field">
          <span class="field-label">Password</span>
          <input v-model="password" class="input" type="password" autocomplete="current-password" required>
        </label>
      </div>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <button class="btn btn-primary btn-block" :disabled="busy">
        <span v-if="busy" class="spinner" aria-hidden="true" /> Sign in
      </button>
      <button v-if="canPasskey" type="button" class="btn btn-tinted btn-block" :disabled="busy" @click="passkey">Sign in with a passkey</button>
      <p class="center footnote">
        <NuxtLink to="/forgot-password">Forgot password?</NuxtLink>
        <template v-if="signUp.mode !== 'closed'"> · <NuxtLink to="/register">Create an account</NuxtLink></template>
      </p>
    </form>

    <form v-else class="stack" @submit.prevent="sendCode">
      <h1 class="title-2 center">Enter your code</h1>
      <p class="subhead center">Open your authenticator app and enter the 6-digit code for Cheddar. Lost your phone? Enter a recovery code instead.</p>
      <div class="card card-pad">
        <label class="visually-hidden" for="code">Code</label>
        <input id="code" v-model="code" v-focus class="input code-input" inputmode="text" autocomplete="one-time-code" maxlength="11" required>
      </div>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="notice notice-info">{{ notice }}</p>
      <button class="btn btn-primary btn-block" :disabled="busy">
        <span v-if="busy" class="spinner" aria-hidden="true" /> Continue
      </button>
      <button v-if="canPasskey" type="button" class="btn btn-tinted btn-block" :disabled="busy" @click="passkey">Use a passkey instead</button>
      <p class="center footnote"><button type="button" class="btn btn-plain" @click="mfaId = ''; code = ''; error = ''">Back</button></p>
    </form>
  </div>
</template>
