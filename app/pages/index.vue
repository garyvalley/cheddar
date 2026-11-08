<script setup lang="ts">
import type { Account } from '~~/shared/accounts'
import { stateByCode } from '~~/shared/states'

const { me } = useAuth()
const { data: list } = await useFetch<{ accounts: Account[] }>('/api/accounts', { default: () => ({ accounts: [] }) })

const steps = computed(() => [
  { done: !!me.value?.verified, label: 'Confirm your email', hint: 'So you can reset your password if you forget it.', to: '/settings' },
  {
    done: !!(me.value?.state && me.value?.filing_status),
    label: 'Choose your state and filing status',
    hint: 'Tax ideas use your own state\'s rules.',
    to: '/settings',
  },
  {
    done: list.value.accounts.length > 0,
    label: 'Connect your accounts',
    hint: 'Link your banks and cards, or import their statements. Everything here is worked out from them.',
    to: '/accounts',
  },
])
const left = computed(() => steps.value.filter(s => !s.done).length)
const greeting = computed(() => (me.value?.name ? `Hi, ${me.value.name.split(' ')[0]}` : 'Overview'))
</script>

<template>
  <div>
    <AppHeader :title="greeting" />

    <section v-if="left" class="group" aria-labelledby="setup">
      <h2 id="setup" class="group-title">Set up · {{ left }} left</h2>
      <div class="card">
        <NuxtLink v-for="s in steps" :key="s.label" :to="s.to" class="row step">
          <span class="tick" :class="{ on: s.done }" aria-hidden="true"><AppIcon v-if="s.done" name="check" /></span>
          <span class="row-label">
            <span class="step-label">{{ s.label }}</span><span class="visually-hidden">{{ s.done ? ', done' : '' }}</span>
            <span class="footnote">{{ s.hint }}</span>
          </span>
          <AppIcon name="chevron" class="chev" />
        </NuxtLink>
      </div>
    </section>

    <section class="group" aria-labelledby="soon">
      <h2 id="soon" class="group-title">Net worth</h2>
      <div class="card card-pad">
        <p class="num large-title muted">—</p>
        <p class="footnote">Net worth from your accounts' balances arrives in the next update.</p>
      </div>
      <p v-if="me?.state" class="group-footer">Tax rules: federal and {{ stateByCode(me.state)?.name }}.</p>
    </section>
  </div>
</template>

<style scoped>
.step { color: var(--text); }
.step:hover { text-decoration: none; background: var(--surface-2); }
.step-label { display: block; }
.tick {
  flex: none; display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%;
  border: 1.5px solid var(--separator);
}
.tick.on { background: var(--success); border-color: var(--success); color: var(--surface); }
.tick :deep(.icon) { width: 1rem; height: 1rem; }
.chev { color: var(--text-3); width: 1rem; height: 1rem; }
</style>
