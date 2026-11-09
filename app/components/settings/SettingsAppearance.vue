<script setup lang="ts">
import type { Profile } from '~~/shared/profile'
import { APPEARANCES, THEMES } from '~~/shared/theme'

const { me } = useAuth()
const { error, run } = useAction()

/** Shows the choice at once, saves it, and puts the old one back if saving fails. */
async function choose(change: Partial<Pick<Profile, 'theme' | 'appearance'>>) {
  if (!me.value) return
  const before = me.value
  me.value = { ...before, ...change }
  const r = await run(() => $fetch('/api/profile', { method: 'PATCH', body: change }))
  if (r) me.value = r.me
  else me.value = before
}
</script>

<template>
  <section class="group" aria-labelledby="appearance-title">
    <h2 id="appearance-title" class="group-title">Appearance</h2>
    <div class="card">
      <div class="row">
        <span id="theme-label" class="row-label">Color</span>
        <div class="segmented" role="group" aria-labelledby="theme-label">
          <button
            v-for="t in THEMES" :key="t.value" type="button" class="seg"
            :aria-pressed="me?.theme === t.value" @click="choose({ theme: t.value })"
          >
            <span class="swatch" :class="`swatch-${t.value}`" aria-hidden="true" />{{ t.label }}
          </button>
        </div>
      </div>
      <div class="row">
        <span id="appearance-label" class="row-label">Light or dark</span>
        <div class="segmented" role="group" aria-labelledby="appearance-label">
          <button
            v-for="a in APPEARANCES" :key="a.value" type="button" class="seg"
            :aria-pressed="me?.appearance === a.value" @click="choose({ appearance: a.value })"
          >
            {{ a.label }}
          </button>
        </div>
      </div>
    </div>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p class="group-footer">Saved to your account, so Cheddar looks the same on every device you sign in on. Automatic follows your device.</p>
  </section>
</template>

<style scoped>
.row { flex-wrap: wrap; gap: 0.5rem; }
.swatch { display: inline-block; width: 0.75rem; height: 0.75rem; margin-right: 0.375rem; border-radius: 50%; vertical-align: -0.0625rem; }
.swatch-violet { background: var(--swatch-violet); }
.swatch-cheddar { background: var(--swatch-cheddar); }
</style>
