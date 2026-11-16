<script setup lang="ts">
// The legal links on every page: in both layouts and on the error page
// (app/error.vue replaces app.vue, so it carries its own).
const { operatorName } = useRuntimeConfig().public
const year = new Date().getFullYear()
</script>

<template>
  <footer class="app-footer caption">
    <nav aria-label="Legal">
      <NuxtLink to="/privacy">Privacy</NuxtLink>
      <span aria-hidden="true"> · </span>
      <NuxtLink to="/terms">Terms</NuxtLink>
      <span aria-hidden="true"> · </span>
      <NuxtLink to="/contact">Contact</NuxtLink>
    </nav>
    <p>© {{ year }} {{ operatorName }}</p>
  </footer>
</template>

<style scoped>
.app-footer { display: grid; justify-items: center; gap: 0.25rem; padding: 2rem 1rem 0; text-align: center; color: var(--text-3); }
.app-footer p { margin: 0; }
.app-footer a { color: var(--text-2); }
</style>
