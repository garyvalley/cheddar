<script setup lang="ts">
/** A section that isn't built yet: what it will do, so the page isn't a dead end. */
defineProps<{ title: string, points: string[] }>()
</script>

<template>
  <div>
    <AppHeader :title="title" />
    <section class="group">
      <div class="card card-pad stack">
        <p class="headline">Coming soon</p>
        <ul class="points">
          <li v-for="p in points" :key="p">{{ p }}</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.points { margin: 0; padding-left: 1.25rem; color: var(--text-2); }
.points li + li { margin-top: 0.375rem; }
</style>
