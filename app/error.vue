<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const unavailable = computed(() => props.error.statusCode === 503)
useHead({ title: unavailable.value ? 'Updating' : 'Not found' })
</script>

<template>
  <main class="err">
    <AppMark />
    <h1 class="title-2">{{ unavailable ? 'Cheddar is updating' : props.error.statusCode === 404 ? 'Page not found' : 'Something went wrong' }}</h1>
    <p class="subhead">{{ unavailable ? 'Try again in a few seconds.' : 'The page may have moved, or the link is wrong.' }}</p>
    <button class="btn btn-primary" @click="clearError({ redirect: unavailable ? undefined : '/' })">
      {{ unavailable ? 'Try again' : 'Go to Overview' }}
    </button>
  </main>
</template>

<style scoped>
.err { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 1rem; padding: 1rem; text-align: center; }
</style>
