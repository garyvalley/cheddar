/**
 * Every page needs a signed-in person unless its meta says `public` or
 * `guestOnly`. The server checks the session on every /api call anyway: this
 * only decides which page to show.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { me, load } = useAuth()
  if (me.value === undefined) await load()

  if (me.value && to.meta.guestOnly) return navigateTo('/')
  if (!me.value && !to.meta.public && !to.meta.guestOnly) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { next: to.fullPath } })
  }
})
