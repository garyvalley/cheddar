<script setup lang="ts">
// Someone who hasn't agreed to the Terms of Use in force (shared/legal.ts):
// an account from before the terms, or one made in the admin UI, or after
// TERMS_VERSION moved. app/middleware/auth.global.ts sends them here first.
import { legalDate, TERMS_VERSION } from '~~/shared/legal'
import type { Me } from '~~/shared/profile'

definePageMeta({ layout: 'auth', agree: true })
useHead({ title: 'Terms of Use' })

const route = useRoute()
const { me, signOut } = useAuth()
const { busy, error, run } = useAction()
const leaving = useAction()
const agree = ref(false)
const before = !!me.value?.terms_version

async function accept() {
  const done = await run(() => $fetch<{ me: Me }>('/api/auth/agree', { method: 'POST' }))
  if (done) {
    me.value = done.me
    await navigateTo(safeNext(route.query.next))
  }
}
</script>

<template>
  <form class="stack" @submit.prevent="accept">
    <h1 class="title-2 center">{{ before ? 'We\'ve updated our terms' : 'Before you go on' }}</h1>
    <p class="subhead center">
      Please read the <NuxtLink to="/terms" target="_blank">Terms of Use</NuxtLink> and the
      <NuxtLink to="/privacy" target="_blank">Privacy Notice</NuxtLink>, in effect from {{ legalDate(TERMS_VERSION) }}.
    </p>
    <div class="card">
      <label class="field agree">
        <input v-model="agree" type="checkbox" required>
        <span class="footnote">I agree to the Terms of Use and the Privacy Notice.</span>
      </label>
    </div>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <button class="btn btn-primary btn-block" :disabled="busy || !agree">
      <span v-if="busy" class="spinner" aria-hidden="true" /> Continue
    </button>
    <p class="center footnote">
      Don't agree? <button type="button" class="btn btn-plain" :disabled="leaving.busy.value" @click="leaving.run(() => signOut())">Sign out</button>
      and ask us through the <NuxtLink to="/contact?topic=privacy">contact form</NuxtLink> to delete your account.
    </p>
  </form>
</template>

<style scoped>
.agree { display: flex; flex-direction: row; align-items: flex-start; gap: 0.625rem; }
.agree input { width: 1.125rem; height: 1.125rem; margin: 0.125rem 0 0; flex: none; accent-color: var(--accent); }
</style>
