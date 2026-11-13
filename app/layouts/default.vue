<script setup lang="ts">
const { me, signOut } = useAuth()
const { busy, run } = useAction()
const route = useRoute()
// A section stays lit on its own subpages too (Accounts → Import).
const current = (to: string) => (to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(`${to}/`))
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#main">Skip to content</a>

    <!--
      One calm bar across the top in the theme's colour: the name, the
      sections, then Settings and Sign out. On a phone the sections move to
      the tab bar at the bottom and the bar keeps the name and Settings.
    -->
    <header class="topbar">
      <div class="topbar-in">
        <NuxtLink to="/" class="brand"><AppMark /> <span>Cheddar</span></NuxtLink>
        <nav class="topnav" aria-label="Main">
          <NuxtLink
            v-for="item in NAV" :key="item.to" :to="item.to" class="topnav-link"
            :class="{ on: current(item.to) }" :aria-current="current(item.to) ? 'page' : undefined"
          >{{ item.label }}</NuxtLink>
        </nav>
        <div class="topbar-end">
          <NuxtLink
            to="/settings" class="bar-link" :class="{ on: current('/settings') }" :title="me?.email"
            aria-label="Settings" :aria-current="current('/settings') ? 'page' : undefined"
          >
            <AppIcon name="settings" /><span class="wide-only">Settings</span>
          </NuxtLink>
          <button class="bar-link wide-only" :disabled="busy" @click="run(() => signOut())">
            <span v-if="busy" class="spinner" aria-hidden="true" /> Sign out
          </button>
        </div>
      </div>
    </header>

    <main id="main" class="main">
      <slot />
    </main>

    <nav class="tabbar" aria-label="Main">
      <NuxtLink
        v-for="item in NAV" :key="item.to" :to="item.to" class="tab"
        :class="{ on: current(item.to) }" :aria-current="current(item.to) ? 'page' : undefined"
      >
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

.topbar { position: sticky; top: 0; z-index: 5; background: var(--bar); color: var(--on-bar); }
.topbar-in {
  display: flex; align-items: center; gap: 2rem;
  max-width: var(--page-w); margin: 0 auto; padding: 0 2rem; min-height: var(--topbar-h);
}
.brand { display: flex; align-items: center; gap: 0.625rem; color: var(--on-bar); font-size: 1.1875rem; font-weight: 700; letter-spacing: -0.01em; }
.brand:hover { text-decoration: none; }
/* The mark's tile is the bar's colour, so a light ring sets it apart. */
.brand :deep(svg) { border-radius: 8px; box-shadow: 0 0 0 1.5px rgb(255 255 255 / 55%); }

.topnav { display: flex; align-self: stretch; gap: 0.25rem; }
.topnav-link {
  display: flex; align-items: center; padding: 0 0.875rem; position: relative;
  color: var(--on-bar-2); font-size: 0.9375rem; font-weight: 500;
}
.topnav-link:hover { color: var(--on-bar); text-decoration: none; }
.topnav-link.on { color: var(--on-bar); font-weight: 600; }
.topnav-link.on::after {
  content: ''; position: absolute; left: 0.875rem; right: 0.875rem; bottom: 0;
  height: 3px; border-radius: 3px 3px 0 0; background: var(--on-bar);
}

.topbar-end { margin-left: auto; display: flex; align-items: center; gap: 0.25rem; }
.bar-link {
  display: inline-flex; align-items: center; gap: 0.375rem; min-height: 2.75rem; padding: 0 0.75rem;
  border: 0; border-radius: var(--radius-sm); background: none; font: inherit; font-size: 0.9375rem;
  color: var(--on-bar-2); cursor: pointer;
}
.bar-link:hover { color: var(--on-bar); background: rgb(255 255 255 / 12%); text-decoration: none; }
.bar-link.on { color: var(--on-bar); background: rgb(255 255 255 / 16%); }
.bar-link :deep(.icon) { width: 1.25rem; height: 1.25rem; }
.topbar :focus-visible { outline-color: var(--on-bar); }

.main { max-width: var(--page-w); margin: 0 auto; padding: 2rem 2rem 4rem; }

.tabbar { display: none; }

@media (max-width: 1023px) {
  .topnav { gap: 0; }
  .topnav-link { padding: 0 0.625rem; }
  .topnav-link.on::after { left: 0.625rem; right: 0.625rem; }
  .topbar-in { gap: 1rem; padding: 0 1.25rem; }
  /* Six sections leave room for Settings' icon only (its label is aria-label). */
  .bar-link > .wide-only { display: none; }
  .bar-link { white-space: nowrap; }
  .main { padding: 1.5rem 1.25rem 3rem; }
}

@media (max-width: 839px) {
  .topnav-link { padding: 0 0.5rem; }
  .topnav-link.on::after { left: 0.5rem; right: 0.5rem; }
  .topbar-in { gap: 0.75rem; }
}

@media (max-width: 767px) {
  .topnav, .wide-only { display: none; }
  .topbar-in { padding: 0 0.5rem 0 1rem; min-height: 3.25rem; }
  .brand { font-size: 1.0625rem; }
  .brand :deep(svg) { width: 24px; height: 24px; border-radius: 7px; }
  .main { padding: 1.25rem 1rem calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 1.5rem); }
  .tabbar {
    position: fixed; inset: auto 0 0 0; z-index: 5;
    display: flex; padding-bottom: env(safe-area-inset-bottom);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-top: 1px solid var(--separator);
  }
  .tab {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.125rem;
    min-height: var(--tabbar-h); color: var(--text-3); font-size: 0.6875rem; font-weight: 500;
  }
  .tab:hover { text-decoration: none; }
  .tab.on { color: var(--accent); }
}
</style>
