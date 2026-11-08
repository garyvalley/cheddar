<script setup lang="ts">
// Every account turns on two-step sign-in before anything else
// (migrations/0002_require_two_step.mjs); app/middleware/auth.global.ts
// sends a signed-in person here until it is on.
definePageMeta({ layout: 'auth', twoStepSetup: true })
useHead({ title: 'Turn on two-step sign-in' })

const { signOut } = useAuth()
const leaving = useAction()
</script>

<template>
  <div class="stack">
    <h1 class="title-2 center">Protect your account</h1>
    <p class="subhead center">
      Cheddar holds your whole financial picture, so every account signs in with two steps: your password, then a
      code from an authenticator app on your phone. It takes about a minute.
    </p>
    <SettingsTwoStep @done="navigateTo('/')" />
    <p class="center footnote">
      <button class="btn btn-plain" :disabled="leaving.busy.value" @click="leaving.run(() => signOut())">
        <span v-if="leaving.busy.value" class="spinner" aria-hidden="true" /> Sign out
      </button>
    </p>
  </div>
</template>
