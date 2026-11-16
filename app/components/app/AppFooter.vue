<script setup lang="ts">
// The legal links on every page: in both layouts and on the error page
// (app/error.vue replaces app.vue, so it carries its own).
const { operatorName } = useRuntimeConfig().public
const year = new Date().getFullYear()
</script>

<template>
  <footer class="app-footer">
    <nav aria-label="Legal">
      <NuxtLink to="/privacy">Privacy notice</NuxtLink>
      <NuxtLink to="/terms">Terms of use</NuxtLink>
      <NuxtLink to="/contact">Contact us</NuxtLink>
    </nav>
    <p>© {{ year }} {{ operatorName }}</p>
  </footer>
</template>

<style scoped>
/* Set off by a rule, in body-size accent links with room to tap, so it reads as a footer and not a hint. */
.app-footer {
  display: grid; justify-items: center; gap: 0.5rem;
  margin-top: 3rem; flex-shrink: 0; padding: 1.25rem 0 0; border-top: var(--border);
  text-align: center; font-size: 0.8125rem; color: var(--text-2);
}
.app-footer nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.25rem 1.5rem; }
.app-footer a {
  display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 0.25rem;
  color: var(--accent); font-size: 0.9375rem; font-weight: 600;
}
.app-footer p { margin: 0; }
/* All three on one line at phone width. */
@media (max-width: 479px) {
  .app-footer nav { column-gap: 0.75rem; }
  .app-footer a { padding: 0; }
}
</style>
