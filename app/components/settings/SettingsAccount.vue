<script setup lang="ts">
import { MIN_LENGTH } from '~~/shared/passwords'

const { me, signOut } = useAuth()
const verify = useAction()
const everywhere = useAction()
const remove = useAction()
const emailChange = useAction()
const passwordChange = useAction()

// Each change opens its own small form; both ask for the current password.
const editing = ref<'' | 'email' | 'password'>('')
const current = ref('')
const newEmail = ref('')
const newPassword = ref('')
const emailSentTo = ref('')
const passwordChanged = ref(false)

function edit(what: '' | 'email' | 'password') {
  editing.value = what
  current.value = newEmail.value = newPassword.value = ''
  emailChange.error.value = passwordChange.error.value = ''
  if (what) emailSentTo.value = ''
  if (what) passwordChanged.value = false
}

async function changeEmail() {
  const to = newEmail.value.trim()
  if (!await emailChange.succeed(() => $fetch('/api/auth/request-email-change', { method: 'POST', body: { password: current.value, email: to } }))) return
  edit('')
  emailSentTo.value = to
}

async function changePassword() {
  if (!await passwordChange.succeed(() => $fetch('/api/auth/change-password', { method: 'POST', body: { password: current.value, newPassword: newPassword.value } }))) return
  edit('')
  passwordChanged.value = true
}

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
        <button v-if="editing !== 'email'" class="btn btn-plain" @click="edit('email')">Change…</button>
      </div>
      <form v-if="editing === 'email'" class="field stack" @submit.prevent="changeEmail">
        <label>
          <span class="field-label">New email</span>
          <input v-model="newEmail" v-focus class="input" type="email" autocomplete="email" required>
        </label>
        <label>
          <span class="field-label">Your password</span>
          <input v-model="current" class="input" type="password" autocomplete="current-password" required>
          <span class="caption">We'll email a link to the new address. Your email stays as it is until you open it.</span>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" :disabled="emailChange.busy.value">
            <span v-if="emailChange.busy.value" class="spinner" aria-hidden="true" /> Send link
          </button>
          <button type="button" class="btn btn-plain" @click="edit('')">Cancel</button>
        </div>
        <p v-if="emailChange.error.value" class="notice notice-error" role="alert">{{ emailChange.error.value }}</p>
      </form>
      <p v-if="emailSentTo" class="row footnote" role="status">
        Sent a link to {{ emailSentTo }}. Open it within 30 minutes to move your account there.
      </p>
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
          Password
          <span v-if="passwordChanged" class="footnote block" role="status">Changed. Every other device has been signed out.</span>
        </span>
        <button v-if="editing !== 'password'" class="btn btn-plain" @click="edit('password')">Change…</button>
      </div>
      <form v-if="editing === 'password'" class="field stack" @submit.prevent="changePassword">
        <label>
          <span class="field-label">Current password</span>
          <input v-model="current" v-focus class="input" type="password" autocomplete="current-password" required>
        </label>
        <label>
          <span class="field-label">New password</span>
          <input v-model="newPassword" class="input" type="password" autocomplete="new-password" :minlength="MIN_LENGTH" required>
          <span class="caption">At least {{ MIN_LENGTH }} characters. Every other device will be signed out.</span>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" :disabled="passwordChange.busy.value">
            <span v-if="passwordChange.busy.value" class="spinner" aria-hidden="true" /> Change password
          </button>
          <button type="button" class="btn btn-plain" @click="edit('')">Cancel</button>
        </div>
        <p v-if="passwordChange.error.value" class="notice notice-error" role="alert">{{ passwordChange.error.value }}</p>
      </form>
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
