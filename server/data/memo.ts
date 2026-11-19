/**
 * The rows reports read, kept a while in this process (issue #115), so a
 * page loaded again doesn't pull years of transactions out of PocketBase
 * once more. Each is kept under the person and the exact query, with the
 * version of its data it was read at (`versionOf()` in transactions.ts):
 * any change to a row it finds (a new one, an edit, a delete, an account
 * left out) makes a new version, and the next read fetches again. Nuxt runs
 * as one pod (k8s/app/nuxt.yaml); each pod would keep its own.
 *
 * Rows are frozen: every reader shares them, so none may change one.
 */

/** How long a read is kept at most, however unchanged its version. */
export const MEMO_TTL_MS = 10 * 60_000
/** Most rows kept in all, the least recently read let go first. */
export const MEMO_MAX_ROWS = 200_000

interface Entry {
  version: string
  rows: readonly unknown[]
  at: number
}

const entries = new Map<string, Entry>()
let held = 0

function drop(key: string) {
  const e = entries.get(key)
  if (!e) return
  held -= e.rows.length
  entries.delete(key)
}

/** What `key` read at `version`, if it's still kept. */
export function recall<T>(key: string, version: string, now = Date.now()): T[] | null {
  const e = entries.get(key)
  if (!e) return null
  if (e.version !== version || now - e.at > MEMO_TTL_MS) {
    drop(key)
    return null
  }
  // Read again: the last to be let go.
  entries.delete(key)
  entries.set(key, e)
  return e.rows as T[]
}

/** Keeps what `key` read at `version`, and hands back the frozen rows. */
export function keep<T extends object>(key: string, version: string, rows: T[], now = Date.now()): T[] {
  drop(key)
  for (const r of rows) Object.freeze(r)
  Object.freeze(rows)
  if (rows.length > MEMO_MAX_ROWS) return rows
  entries.set(key, { version, rows, at: now })
  held += rows.length
  for (const k of entries.keys()) {
    if (held <= MEMO_MAX_ROWS) break
    drop(k)
  }
  return rows
}

/** Lets everything go (tests). */
export function forgetAll() {
  entries.clear()
  held = 0
}
