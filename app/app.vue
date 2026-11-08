<script setup lang="ts">
useHead({ titleTemplate: title => (title ? `${title} · Cheddar` : 'Cheddar') })
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
