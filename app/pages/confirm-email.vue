<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Confirm new email' })

const route = useRoute()
const { me } = useAuth()
const { busy, error, succeed } = useAction()
const password = ref('')
const done = ref(false)

// The link may open on any device, signed in or not, so the password says
// it's the account's owner. It waits for a tap, so a mail scanner opening
// the link changes nothing.
async function confirm() {
  const ok = await succeed(() => $fetch('/api/auth/confirm-email-change', {
    method: 'POST', body: { token: String(route.query.token || ''), password: password.value },
  }))
  if (!ok) return
  // Every session ended with the old address, this browser's too.
  me.value = null
  done.value = true
}
</script>

<template>
  <div class="stack">
    <h1 class="title-2 center">Confirm your new email</h1>
    <template v-if="done">
      <p class="notice notice-success" role="status">Your email is changed. Every device that was signed in has been signed out: sign in with the new address.</p>
      <NuxtLink to="/login" class="btn btn-primary btn-block">Sign in</NuxtLink>
    </template>
    <form v-else class="stack" @submit.prevent="confirm">
      <div class="card">
        <label class="field">
          <span class="field-label">Your password</span>
          <input v-model="password" v-focus class="input" type="password" autocomplete="current-password" required>
        </label>
      </div>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }} Check your password. The link may also have expired: ask for a new one in Settings.</p>
      <button class="btn btn-primary btn-block" :disabled="busy">
        <span v-if="busy" class="spinner" aria-hidden="true" /> Confirm new email
      </button>
    </form>
  </div>
</template>
