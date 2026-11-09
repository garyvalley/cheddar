<script setup lang="ts">
import { DEFAULT_APPEARANCE, DEFAULT_THEME } from '~~/shared/theme'

const { me } = useAuth()

// The person's own theme and light or dark (Settings, Appearance); signed
// out, the defaults. Set on <html> in the server's render, so nothing flashes.
useHead({
  titleTemplate: title => (title ? `${title} · Cheddar` : 'Cheddar'),
  htmlAttrs: {
    'data-theme': () => me.value?.theme ?? DEFAULT_THEME,
    'data-appearance': () => me.value?.appearance ?? DEFAULT_APPEARANCE,
  },
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
