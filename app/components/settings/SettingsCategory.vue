<script setup lang="ts">
/**
 * One of Settings' categories: a heading that opens and closes the sections
 * under it. Which ones are open is remembered in this browser
 * (useSettingsOpen). A link to anything inside (/settings#export) opens its
 * category and scrolls to it.
 */
const props = defineProps<{ id: string, title: string, sub: string }>()
const open = useSettingsOpen()
const isOpen = computed(() => open.value.includes(props.id))
const body = ref<HTMLElement | null>(null)

function toggle() {
  open.value = isOpen.value ? open.value.filter(id => id !== props.id) : [...open.value, props.id]
}

// A hash naming this category, or an element inside it, opens it and brings it into view.
const route = useRoute()
function reveal() {
  const id = decodeURIComponent(route.hash.slice(1))
  if (!id) return
  const target = id === props.id ? body.value?.parentElement : body.value?.querySelector(`#${CSS.escape(id)}`)
  if (!target) return
  if (!isOpen.value) open.value = [...open.value, props.id]
  nextTick(() => target.scrollIntoView({ block: 'start' }))
}
onMounted(reveal)
watch(() => route.hash, reveal)
</script>

<template>
  <section :id="props.id" class="category" :class="{ open: isOpen }" :aria-labelledby="`${props.id}-title`">
    <h2 :id="`${props.id}-title`" class="category-head">
      <button class="category-toggle" :aria-expanded="isOpen" :aria-controls="`${props.id}-body`" @click="toggle">
        <span class="category-text">
          <span class="category-title">{{ props.title }}</span>
          <span class="category-sub">{{ props.sub }}</span>
        </span>
        <AppIcon name="chevron" class="category-chevron" />
      </button>
    </h2>
    <div v-show="isOpen" :id="`${props.id}-body`" ref="body" class="category-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.category { border-bottom: var(--border); }
.category:first-of-type { border-top: var(--border); }
.category-head { margin: 0; font: inherit; }
.category-toggle {
  display: flex; align-items: center; gap: 1rem; width: 100%; min-height: 4rem; padding: 0.875rem 0.25rem;
  border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer;
}
.category-toggle:hover .category-title { color: var(--accent); }
.category-text { flex: 1; min-width: 0; display: grid; gap: 0.125rem; }
.category-title { font-size: 1.1875rem; font-weight: 600; letter-spacing: -0.005em; }
.category-sub { font-size: 0.875rem; color: var(--text-2); }
.category-chevron { color: var(--text-3); transition: transform 0.15s; }
.open .category-chevron { transform: rotate(90deg); }
.category-body { padding: 0.5rem 0 1rem; }
@media (prefers-reduced-motion: reduce) { .category-chevron { transition: none; } }
</style>
