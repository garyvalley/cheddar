/**
 * A fixed-window counter per key, in memory. The web app runs as one
 * replica (k8s/app/nuxt.yaml), so one process sees every request; a second
 * replica would need a shared store.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number, resetAt: number }>()
  readonly limit: number
  readonly windowMs: number

  // Plain fields, not parameter properties: Node's type stripping, which the
  // unit tests run on, can't erase those.
  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }

  /** Counts a request for `key` at `now`; returns the seconds to wait when it is over the limit, else 0. */
  hit(key: string, now: number): number {
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      if (this.hits.size > 10_000) this.sweep(now)
      return 0
    }
    entry.count++
    return entry.count > this.limit ? Math.ceil((entry.resetAt - now) / 1000) : 0
  }

  /** Forgets windows that have ended, so the map can't grow without bound. */
  private sweep(now: number) {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key)
    }
  }
}
