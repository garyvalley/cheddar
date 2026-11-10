<script setup lang="ts">
/** A page's large title, which also names the page in the browser tab, and its actions (the slot). */
const props = defineProps<{ title: string }>()
useHead({ title: () => props.title })
</script>

<template>
  <header class="page-header">
    <h1 class="large-title">{{ title }}</h1>
    <!-- The page's own action, such as Import. -->
    <div class="actions"><slot /></div>
    <!-- On a phone, Settings isn't a tab: it sits here, as in iOS apps. -->
    <NuxtLink to="/settings" class="settings-link" aria-label="Settings">
      <AppIcon name="settings" />
    </NuxtLink>
  </header>
</template>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; margin: 0.5rem 0 1.5rem; }
.actions { margin-left: auto; display: flex; gap: 0.5rem; }
.settings-link {
  display: none; align-items: center; justify-content: center;
  width: 2.75rem; height: 2.75rem; margin-right: -0.5rem; color: var(--accent);
}
@media (max-width: 767px) { .actions { margin-left: auto; display: flex; gap: 0.5rem; }
.settings-link { display: inline-flex; } }
</style>
