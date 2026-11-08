<script setup lang="ts">
const { me, signOut } = useAuth()
const { busy, run } = useAction()
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#main">Skip to content</a>

    <nav class="sidebar" aria-label="Main">
      <NuxtLink to="/" class="brand"><AppMark /> <span class="headline">Cheddar</span></NuxtLink>
      <ul>
        <li v-for="item in NAV" :key="item.to">
          <NuxtLink :to="item.to" class="side-link"><AppIcon :name="item.icon" /> {{ item.label }}</NuxtLink>
        </li>
      </ul>
      <div class="sidebar-foot">
        <NuxtLink to="/settings" class="side-link"><AppIcon name="settings" /> Settings</NuxtLink>
        <p class="caption who">{{ me?.email }}</p>
        <button class="btn btn-plain" :disabled="busy" @click="run(() => signOut())">
          <span v-if="busy" class="spinner" aria-hidden="true" /> Sign out
        </button>
      </div>
    </nav>

    <main id="main" class="main">
      <slot />
    </main>

    <nav class="tabbar" aria-label="Main">
      <NuxtLink v-for="item in NAV" :key="item.to" :to="item.to" class="tab">
        <AppIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.skip-link { position: absolute; left: -999px; top: 0.5rem; z-index: 10; }
.skip-link:focus { left: 0.5rem; background: var(--surface); padding: 0.5rem 1rem; border-radius: var(--radius-sm); }

.shell { min-height: 100dvh; }

.sidebar {
  position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w);
  display: flex; flex-direction: column; padding: 1rem 0.75rem;
  background: var(--surface); border-right: 0.5px solid var(--separator);
}
.sidebar ul { list-style: none; margin: 1rem 0 0; padding: 0; }
.brand { display: flex; align-items: center; gap: 0.625rem; padding: 0.5rem; color: var(--text); }
.brand:hover { text-decoration: none; }
.side-link {
  display: flex; align-items: center; gap: 0.75rem; min-height: 2.75rem; padding: 0 0.75rem;
  border-radius: var(--radius-sm); color: var(--text); font-size: 0.9375rem;
}
.side-link:hover { text-decoration: none; background: var(--surface-2); }
.side-link.router-link-exact-active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.sidebar-foot { margin-top: auto; }
.who { margin: 0.75rem 0.75rem 0.25rem; overflow: hidden; text-overflow: ellipsis; }

.main { margin-left: var(--sidebar-w); padding: 2rem 2.5rem 3rem; max-width: calc(var(--sidebar-w) + 56rem); }

.tabbar { display: none; }

@media (max-width: 767px) {
  .sidebar { display: none; }
  .main { margin-left: 0; padding: 1rem 1rem calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 1.5rem); }
  .tabbar {
    position: fixed; inset: auto 0 0 0; z-index: 5;
    display: flex; padding-bottom: env(safe-area-inset-bottom);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-top: 0.5px solid var(--separator);
  }
  .tab {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.125rem;
    min-height: var(--tabbar-h); color: var(--text-3); font-size: 0.6875rem; font-weight: 500;
  }
  .tab:hover { text-decoration: none; }
  .tab.router-link-exact-active { color: var(--accent); }
}
</style>
