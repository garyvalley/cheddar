import { RateLimiter } from '../utils/rate-limit'

/**
 * Limits the routes that guess at credentials or send mail: 10 tries per
 * client address in 5 minutes (NUXT_AUTH_RATE_LIMIT changes the 10, for the
 * API suites that sign in many times). A two-step code also locks its account after
 * five wrong tries (pb_hooks/lib/lockout.js); this stops one address working
 * through many accounts' passwords.
 *
 * The client address is the one Cloudflare reports when NUXT_CLIENT_IP_HEADER
 * names its header (the cluster, where only cloudflared can reach this pod:
 * k8s/app/network-policy.yaml), else the connection's own.
 */
const LIMITED = new Set([
  '/api/auth/login',
  '/api/auth/code',
  '/api/auth/register',
  '/api/auth/request-password-reset',
  '/api/auth/confirm-password-reset',
  '/api/auth/request-verification',
])

let limiter: RateLimiter | undefined

export default defineEventHandler((event) => {
  if (event.method !== 'POST' || !LIMITED.has(event.path.split('?')[0]!)) return
  const config = useRuntimeConfig()
  limiter ??= new RateLimiter(Number(config.authRateLimit), 5 * 60 * 1000)
  const header = config.clientIpHeader
  const ip = (header && getRequestHeader(event, header)) || getRequestIP(event) || 'unknown'
  const wait = limiter.hit(ip, Date.now())
  if (wait) {
    setResponseHeader(event, 'retry-after', wait)
    throw createError({ statusCode: 429, statusMessage: `Too many tries. Wait ${Math.ceil(wait / 60)} min and try again.` })
  }
})
