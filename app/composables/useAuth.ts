import type { Me } from '~~/shared/profile'

/**
 * Who is signed in. `undefined` until asked, then the person or null. The
 * session itself is an httpOnly cookie the page can't read, so the server
 * answers (GET /api/auth/me).
 */
export function useAuth() {
  const me = useState<Me | null | undefined>('me', () => undefined)

  async function load() {
    const { me: who } = await useRequestFetch()('/api/auth/me')
    me.value = who
  }

  async function signOut(everywhere = false) {
    await $fetch(everywhere ? '/api/auth/logout-everywhere' : '/api/auth/logout', { method: 'POST' })
    me.value = null
    await navigateTo('/login')
  }

  return { me, load, signOut }
}
