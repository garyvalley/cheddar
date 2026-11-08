<template>
  <main class="auth">
    <div class="auth-box">
      <div class="auth-brand"><AppMark /> <span class="title-3">Cheddar</span></div>
      <slot />
    </div>
  </main>
</template>

<style scoped>
.auth { min-height: 100dvh; display: grid; place-items: start center; padding: 12vh 1rem 2rem; }
.auth-box { width: 100%; max-width: 24rem; }
.auth-brand { display: flex; align-items: center; justify-content: center; gap: 0.625rem; margin-bottom: 1.5rem; }
</style>
