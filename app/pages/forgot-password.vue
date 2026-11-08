<script setup lang="ts">
definePageMeta({ layout: 'auth', guestOnly: true })
useHead({ title: 'Reset password' })

const { busy, error, run } = useAction()
const email = ref('')
const sent = ref(false)

async function send() {
  const ok = await run(() => $fetch('/api/auth/request-password-reset', { method: 'POST', body: { email: email.value } }))
  if (ok !== undefined) sent.value = true
}
</script>

<template>
  <div class="stack">
    <h1 class="title-2 center">Reset your password</h1>
    <p v-if="sent" class="notice notice-success" role="status">
      If {{ email }} has a Cheddar account, an email with a reset link is on its way. The link works for 30 minutes.
    </p>
    <form v-else class="stack" @submit.prevent="send">
      <p class="subhead center">Enter your email and we'll send you a link to choose a new password.</p>
      <div class="card">
        <label class="field">
          <span class="field-label">Email</span>
          <input v-model="email" class="input" type="email" autocomplete="email" required v-focus>
        </label>
      </div>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <button class="btn btn-primary btn-block" :disabled="busy">
        <span v-if="busy" class="spinner" aria-hidden="true" /> Send link
      </button>
    </form>
    <p class="center footnote"><NuxtLink to="/login">Back to sign in</NuxtLink></p>
  </div>
</template>
