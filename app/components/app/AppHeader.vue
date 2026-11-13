<script setup lang="ts">
/**
 * A page's title, which also names the page in the browser tab, an optional
 * line under it, and the page's own actions (the slot), such as Import.
 */
const props = defineProps<{ title: string, sub?: string }>()
useHead({ title: () => props.title })
</script>

<template>
  <header class="page-header">
    <div class="page-titles">
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="sub" class="page-sub">{{ sub }}</p>
    </div>
    <div class="actions"><slot /></div>
  </header>
</template>

<style scoped>
.page-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem 1rem; margin: 0 0 1.5rem; }
.page-titles { flex: 1 1 14rem; min-width: 0; }
.page-title { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.015em; }
.page-sub { margin: 0.25rem 0 0; font-size: 0.9375rem; color: var(--text-2); }
.actions { margin-left: auto; display: flex; gap: 0.5rem; flex: none; }
@media (max-width: 767px) { .page-title { font-size: 1.5rem; } }
</style>
