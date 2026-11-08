<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Confirm email' })

const route = useRoute()
const { me, load } = useAuth()
const { busy, error, run } = useAction()
const done = ref(false)

// Confirming changes server state, so it waits for a tap rather than
// running on page load, where a mail scanner opening the link would do it.
async function confirm() {
  const ok = await run(() => $fetch('/api/auth/confirm-verification', { method: 'POST', body: { token: String(route.query.token || '') } }))
  if (ok === undefined) return
  done.value = true
  if (me.value) await load()
}
</script>

<template>
  <div class="stack">
    <h1 class="title-2 center">Confirm your email</h1>
    <template v-if="done">
      <p class="notice notice-success" role="status">Your email is confirmed.</p>
      <NuxtLink :to="me ? '/' : '/login'" class="btn btn-primary btn-block">{{ me ? 'Continue' : 'Sign in' }}</NuxtLink>
    </template>
    <template v-else>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }} The link may have expired: ask for a new one in Settings.</p>
      <button class="btn btn-primary btn-block" :disabled="busy" @click="confirm">
        <span v-if="busy" class="spinner" aria-hidden="true" /> Confirm email
      </button>
    </template>
  </div>
</template>
