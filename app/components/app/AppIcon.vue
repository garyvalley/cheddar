<script setup lang="ts">
/**
 * Line icons in the spirit of SF Symbols, drawn on a 24-unit grid with the
 * current text colour. Decorative: the label beside each one names it.
 */
const props = defineProps<{ name: keyof typeof PATHS }>()

const PATHS = {
  overview: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  accounts: 'M3 9h18M4.5 9V19M9.5 9v10M14.5 9v10M19.5 9v10M3 20.5h18M12 3.5 3 8h18z',
  spending: 'M12 3a9 9 0 1 0 9 9h-9zM14.5 3.4A9 9 0 0 1 20.6 9.5H14.5z',
  projections: 'M3.5 20.5h17M5 16l4.5-5 3.5 3 6-7M15 7h4v4',
  taxes: 'M7 3.5h7.5L19 8v12.5H7zM14.5 3.5V8H19M9.5 17.5l6-6M10 12h.01M15 17h.01',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 0 1-1.8 1l-.3 2h-4l-.3-2a7.6 7.6 0 0 1-1.8-1l-1.9.7-2-3.4 1.6-1.2a7.4 7.4 0 0 1 0-3l-1.6-1.2 2-3.4 1.9.7a7.6 7.6 0 0 1 1.8-1l.3-2h4l.3 2a7.6 7.6 0 0 1 1.8 1l1.9-.7 2 3.4-1.6 1.2a7.4 7.4 0 0 1 0 3z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9.5 5.5 16 12l-6.5 6.5',
} as const
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  ><path :d="PATHS[props.name]" /></svg>
</template>

<style scoped>
.icon { flex: none; width: 1.375rem; height: 1.375rem; }
</style>
