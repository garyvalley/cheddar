import type { Me } from '~~/shared/profile'
import { deviceTimeZone } from '~~/shared/time-zone'

/**
 * Every page needs a signed-in person unless its meta says `public` or
 * `guestOnly`, and a person without two-step sign-in sees only /setup until
 * it is on. The server enforces both anyway (PocketBase's collection rules,
 * migrations/0002_require_two_step.mjs): this only decides which page to show.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { me, load } = useAuth()
  if (me.value === undefined) await load()
  if (import.meta.client) rememberTimeZone(me)

  if (me.value && to.meta.guestOnly) return navigateTo('/')
  if (!me.value && !to.meta.public && !to.meta.guestOnly) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { next: to.fullPath } })
  }
  if (me.value && !me.value.mfa_enabled && !to.meta.public && !to.meta.twoStepSetup) return navigateTo('/setup')
  if (me.value?.mfa_enabled && to.meta.twoStepSetup) return navigateTo('/')
})

/**
 * Someone whose time zone isn't known yet gets this device's, once, so the
 * server's "today" is theirs (shared/time-zone.ts); Settings can change it.
 */
function rememberTimeZone(me: Ref<Me | null | undefined>) {
  const zone = deviceTimeZone()
  if (!me.value?.mfa_enabled || me.value.time_zone || !zone || asked) return
  asked = true
  $fetch('/api/profile', { method: 'PATCH', body: { time_zone: zone } })
    .then((r) => { me.value = r.me })
    .catch(() => { asked = false })
}
let asked = false
