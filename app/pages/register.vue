<script setup lang="ts">
import { MIN_LENGTH } from '~~/shared/passwords'

definePageMeta({ layout: 'auth', guestOnly: true })
useHead({ title: 'Create an account' })

const { me } = useAuth()
const { busy, error, run } = useAction()
const name = ref('')
const email = ref('')
const password = ref('')

async function create() {
  const body = { name: name.value, email: email.value, password: password.value }
  const made = await run(async () => {
    await $fetch('/api/auth/register', { method: 'POST', body })
    return $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
  })
  if (made && 'me' in made) {
    me.value = made.me
    await navigateTo('/')
  }
}
</script>

<template>
  <form class="stack" @submit.prevent="create">
    <h1 class="title-2 center">Create your account</h1>
    <div class="card">
      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="name" class="input" autocomplete="name" maxlength="100">
      </label>
      <label class="field">
        <span class="field-label">Email</span>
        <input v-model="email" class="input" type="email" autocomplete="email" required>
      </label>
      <label class="field">
        <span class="field-label">Password</span>
        <input v-model="password" class="input" type="password" autocomplete="new-password" :minlength="MIN_LENGTH" required aria-describedby="pw-hint">
        <span id="pw-hint" class="caption">At least {{ MIN_LENGTH }} characters. A short sentence is easy to remember and hard to guess.</span>
      </label>
    </div>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <button class="btn btn-primary btn-block" :disabled="busy">
      <span v-if="busy" class="spinner" aria-hidden="true" /> Create account
    </button>
    <p class="center footnote">Already have one? <NuxtLink to="/login">Sign in</NuxtLink></p>
  </form>
</template>
