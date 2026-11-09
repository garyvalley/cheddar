<script setup lang="ts">
import { MARK_COLOURS as C, WEDGE } from '~~/shared/mark'
</script>

<template>
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <!-- The tile follows the person's colour theme; the icon files use C.tile. -->
    <rect width="32" height="32" rx="8" :fill="C.tile" style="fill: var(--mark-tile)" />
    <path v-for="p in WEDGE.paths" :key="p.d" :d="p.d" :fill="C[p.fill]" />
    <circle v-for="h in WEDGE.holes" :key="h.cx" :cx="h.cx" :cy="h.cy" :r="h.r" :fill="C[h.fill]" />
  </svg>
</template>
