<script setup lang="ts">
import { MIN_LENGTH } from '~~/shared/passwords'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Choose a new password' })

const route = useRoute()
const { me } = useAuth()
const { busy, error, succeed } = useAction()
const password = ref('')
const done = ref(false)

async function save() {
  const ok = await succeed(() => $fetch('/api/auth/confirm-password-reset', {
    method: 'POST', body: { token: String(route.query.token || ''), password: password.value },
  }))
  if (!ok) return
  // Every session ended with the old password, this browser's too.
  me.value = null
  done.value = true
}
</script>

<template>
  <div class="stack">
    <h1 class="title-2 center">Choose a new password</h1>
    <template v-if="done">
      <p class="notice notice-success" role="status">Your password is changed, and every device that was signed in has been signed out.</p>
      <NuxtLink to="/login" class="btn btn-primary btn-block">Sign in</NuxtLink>
    </template>
    <form v-else class="stack" @submit.prevent="save">
      <div class="card">
        <label class="field">
          <span class="field-label">New password</span>
          <input v-model="password" v-focus class="input" type="password" autocomplete="new-password" :minlength="MIN_LENGTH" required>
          <span class="caption">At least {{ MIN_LENGTH }} characters.</span>
        </label>
      </div>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }} The link may have expired: <NuxtLink to="/forgot-password">ask for a new one</NuxtLink>.</p>
      <button class="btn btn-primary btn-block" :disabled="busy">
        <span v-if="busy" class="spinner" aria-hidden="true" /> Save password
      </button>
    </form>
  </div>
</template>
