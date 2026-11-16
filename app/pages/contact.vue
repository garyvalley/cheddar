<script setup lang="ts">
// The contact form: a message to whoever runs Cheddar (shared/contact.ts,
// POST /api/contact). Public, so someone who can't sign in can still write.
// `?topic=security` (security.txt, the Terms) or `?topic=privacy` picks the
// topic. The hidden "website" field is for bots only.
import { isTopic, MESSAGE_MAX, TOPICS, type Topic } from '~~/shared/contact'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Contact' })

const route = useRoute()
const { me } = useAuth()
const { busy, error, succeed } = useAction()
const name = ref(me.value?.name ?? '')
const email = ref(me.value?.email ?? '')
const topic = ref<Topic>(isTopic(route.query.topic) ? route.query.topic : 'question')
const message = ref('')
const website = ref('')
const sent = ref(false)

async function send() {
  sent.value = await succeed(() => $fetch('/api/contact', {
    method: 'POST',
    body: { name: name.value, email: email.value, topic: topic.value, message: message.value, website: website.value },
  }))
}
</script>

<template>
  <div v-if="sent" class="stack">
    <h1 class="title-2 center">Message sent</h1>
    <div class="card card-pad">
      <p class="footnote">Thanks. We'll reply to {{ email }}.</p>
    </div>
    <p class="center footnote"><NuxtLink :to="me ? '/' : '/login'">{{ me ? 'Back to Cheddar' : 'Sign in' }}</NuxtLink></p>
  </div>
  <form v-else class="stack" @submit.prevent="send">
    <h1 class="title-2 center">Contact us</h1>
    <p class="subhead center">Questions about Cheddar, your data or the Terms, or a security problem to report.</p>
    <div class="card">
      <label class="field">
        <span class="field-label">Name (optional)</span>
        <input v-model="name" class="input" autocomplete="name" maxlength="100">
      </label>
      <label class="field">
        <span class="field-label">Email to reply to</span>
        <input v-model="email" class="input" type="email" autocomplete="email" required>
      </label>
      <label class="field">
        <span class="field-label">About</span>
        <select v-model="topic" class="select">
          <option v-for="t in TOPICS" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Message</span>
        <textarea v-model="message" class="input message" rows="6" :maxlength="MESSAGE_MAX" required />
      </label>
      <label class="trap" aria-hidden="true">
        Website <input v-model="website" tabindex="-1" autocomplete="off">
      </label>
    </div>
    <p v-if="topic === 'security'" class="notice notice-info">
      Please describe what you found and how to see it, and don't look at anyone else's data. Thank you for telling us.
    </p>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <button class="btn btn-primary btn-block" :disabled="busy">
      <span v-if="busy" class="spinner" aria-hidden="true" /> Send
    </button>
  </form>
</template>

<style scoped>
.card-pad > p { margin: 0; }
.message { resize: vertical; min-height: 8rem; font: inherit; }
.trap { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
</style>
