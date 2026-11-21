<script setup lang="ts">
// Trends: how the money has gone (TrendsPast, months of income, spending and
// where it went) and where it's heading (TrendsAhead: savings rate, your
// investments grown on, and paying off debt). One tab for both, since the nav
// has no room for a seventh; which half shows lives in the address (?view=).

const VIEWS = [
  { id: 'history', label: 'History', sub: 'Across months: what came in, what went out, and where it went.' },
  { id: 'projections', label: 'Projections', sub: 'Where your savings, investments and debts are heading.' },
] as const
type ViewId = typeof VIEWS[number]['id']

const route = useRoute()
const router = useRouter()
const view = computed<ViewId>(() => (route.query.view === 'projections' ? 'projections' : 'history'))
const shown = computed(() => VIEWS.find(v => v.id === view.value)!)
// History's months (range, from, to) are its own; they don't follow to Projections.
const pick = (id: ViewId) => router.replace({ query: id === 'history' ? {} : { view: id } })
</script>

<template>
  <div>
    <AppHeader title="Trends" :sub="shown.sub">
      <div class="segmented" role="group" aria-label="Show">
        <button v-for="v in VIEWS" :key="v.id" class="seg" :aria-pressed="view === v.id" @click="pick(v.id)">{{ v.label }}</button>
      </div>
    </AppHeader>

    <TrendsAhead v-if="view === 'projections'" />
    <TrendsPast v-else />
  </div>
</template>
