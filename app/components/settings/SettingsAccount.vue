<script setup lang="ts">
const { me, signOut } = useAuth()
const verify = useAction()
const everywhere = useAction()
const remove = useAction()

const sent = ref(false)
const deleting = ref(false)
const password = ref('')

async function resend() {
  sent.value = await verify.succeed(() => $fetch('/api/auth/request-verification', { method: 'POST', body: { email: me.value?.email } }))
}

async function deleteAccount() {
  if (!await remove.succeed(() => $fetch('/api/auth/delete-account', { method: 'POST', body: { password: password.value } }))) return
  me.value = null
  await navigateTo('/login')
}
</script>

<template>
  <section class="group" aria-labelledby="account-title">
    <h2 id="account-title" class="group-title">Account</h2>
    <div class="card">
      <div class="row">
        <span class="row-label">Email</span>
        <span class="row-value">{{ me?.email }}</span>
      </div>
      <div class="row">
        <span class="row-label">
          <span class="badge" :class="me?.verified ? 'badge-on' : 'badge-off'">{{ me?.verified ? 'Confirmed' : 'Not confirmed' }}</span>
        </span>
        <button v-if="!me?.verified && !sent" class="btn btn-plain" :disabled="verify.busy.value" @click="resend">
          <span v-if="verify.busy.value" class="spinner" aria-hidden="true" /> Send confirmation email
        </button>
        <span v-else-if="sent" class="footnote" role="status">Sent. Check your inbox.</span>
      </div>
      <div class="row">
        <span class="row-label">
          Sign out everywhere
          <span class="footnote block">Ends every session, on every device, this one too.</span>
        </span>
        <button class="btn btn-tinted" :disabled="everywhere.busy.value" @click="everywhere.run(() => signOut(true))">
          <span v-if="everywhere.busy.value" class="spinner" aria-hidden="true" /> Sign out
        </button>
      </div>
    </div>
    <p v-if="verify.error.value || everywhere.error.value" class="notice notice-error" role="alert">
      {{ verify.error.value || everywhere.error.value }}
    </p>
  </section>

  <section class="group" aria-labelledby="danger-title">
    <h2 id="danger-title" class="group-title">Delete account</h2>
    <div class="card">
      <div v-if="!deleting" class="row">
        <span class="row-label footnote">Deletes your account and everything in it. This can't be undone.</span>
        <button class="btn btn-danger" @click="deleting = true">Delete…</button>
      </div>
      <form v-else class="field stack" @submit.prevent="deleteAccount">
        <label>
          <span class="field-label">Enter your password to delete your account for good</span>
          <input v-model="password" v-focus class="input" type="password" autocomplete="current-password" required>
        </label>
        <div class="btn-row">
          <button class="btn btn-danger" :disabled="remove.busy.value">
            <span v-if="remove.busy.value" class="spinner" aria-hidden="true" /> Delete my account
          </button>
          <button type="button" class="btn btn-plain" @click="deleting = false; password = ''">Cancel</button>
        </div>
      </form>
    </div>
    <p v-if="remove.error.value" class="notice notice-error" role="alert">{{ remove.error.value }}</p>
  </section>
</template>
