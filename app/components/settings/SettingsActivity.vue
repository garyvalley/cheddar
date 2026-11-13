<script setup lang="ts">
import { describeActivity, isWarning, type ActivityEvent } from '~~/shared/activity'

// Read in the browser: times and places are shown in the person's own zone and language.
const { data, status } = useFetch<{ activity: ActivityEvent[] }>('/api/auth/activity', { server: false, default: () => ({ activity: [] }) })

const where = (code: string) => {
  if (!code) return ''
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code
  }
  catch {
    return code
  }
}
const when = (created: string) => new Date(created.replace(' ', 'T')).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const about = (e: ActivityEvent) => [when(e.created), e.device, where(e.place)].filter(Boolean).join(' · ')
</script>

<template>
  <section class="group" aria-labelledby="activity-title">
    <h2 id="activity-title" class="group-title">Recent activity</h2>
    <div class="card">
      <div v-for="(e, i) in data.activity" :key="i" class="row">
        <span class="row-label">
          <span class="block" :class="{ warn: isWarning(e.kind) }">{{ describeActivity(e) }}</span>
          <span class="footnote block">{{ about(e) }}</span>
        </span>
      </div>
      <p v-if="!data.activity.length" class="row footnote">{{ status === 'success' ? 'Nothing yet.' : 'Loading…' }}</p>
    </div>
    <p class="group-footer">
      Sign-ins and changes to how you sign in, your banks and your data, for 90 days.
      Anything you don't recognize: change your password, then sign out everywhere.
    </p>
  </section>
</template>

<style scoped>
.warn { color: var(--warning); }
</style>
