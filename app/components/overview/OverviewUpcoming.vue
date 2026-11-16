<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import type { Upcoming } from '~~/shared/upcoming'

// Overview's "Coming up" (shared/upcoming.ts): the next week's bills and
// planned money, and subscriptions whose price just went up. Hidden when
// there's neither; loaded after the page so it never holds it up.
const { data } = useFetch<Upcoming>('/api/upcoming', { lazy: true, server: false })
const today = useToday()
const tomorrow = computed(() => new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10))
const when = (ymd: string) => ymd === today ? 'Today' : ymd === tomorrow.value ? 'Tomorrow' : new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const shown = computed(() => !!data.value && (data.value.events.length > 0 || data.value.rises.length > 0))
</script>

<template>
  <section v-if="shown && data" class="group" aria-labelledby="upcoming-title">
    <div class="card">
      <div class="panel-head">
        <h2 id="upcoming-title" class="panel-title">Coming up this week</h2>
        <NuxtLink to="/cashflow" class="footnote">Cash flow</NuxtLink>
      </div>
      <div v-for="r in data.rises" :key="`rise-${r.key}`" class="row rise" role="note">
        <AppIcon name="rise" class="warn-icon" />
        <span class="row-label">
          <span class="block"><strong>{{ r.name }}</strong> went up from {{ formatCents(r.from_cents) }} to {{ formatCents(r.to_cents) }}</span>
          <span class="footnote">Since {{ when(r.on) }} · <span class="loss">{{ formatCents(r.yearly_cents) }} more a year</span></span>
        </span>
      </div>
      <ul v-if="data.events.length" class="list">
        <li v-for="e in data.events" :key="e.id" class="row">
          <span class="row-label">
            <span class="block">{{ e.name }}</span>
            <span class="footnote">{{ when(e.date) }} · {{ e.source === 'recurring' ? 'Usual charge' : 'Planned' }}</span>
          </span>
          <span class="num" :class="moneyTone(e.amount_cents)">{{ formatCents(e.amount_cents) }}</span>
        </li>
      </ul>
      <p v-if="data.due_cents" class="row footnote total">{{ formatCents(data.due_cents) }} due out in the next {{ data.days }} days</p>
    </div>
  </section>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li, .rise + .list, .rise + .rise { border-top: var(--border); }
.rise { gap: 0.75rem; background: color-mix(in srgb, var(--warning) 8%, var(--surface)); }
.warn-icon { color: var(--warning); flex: none; }
.total { border-top: var(--border); justify-content: flex-end; }
</style>
