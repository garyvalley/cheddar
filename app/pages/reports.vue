<script setup lang="ts">
// Reports became Trends' History; old links (with their months) land there.
definePageMeta({ redirect: to => ({ path: '/trends', query: to.query }) })
</script>

<template>
  <div />
</template>
