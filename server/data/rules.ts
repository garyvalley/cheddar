import type { MerchantRule, Rule, Rules } from '~~/shared/rules'
import type { Session } from './session'

/**
 * Settings → Rules: the routes in pb_hooks/rules.pb.js, which alone read
 * and write the person's rules (shared/rules.ts) and learned merchant rules.
 */
export async function listRules(s: Session): Promise<Rules> {
  return await s.send('/api/rules', { method: 'GET' })
}

/** Adds a rule (no id) or changes one; with `apply`, past transactions too. */
export async function saveRule(
  s: Session,
  id: string | null,
  body: Record<string, unknown>,
): Promise<{ rule: Rule, applied: number }> {
  return await s.send(id ? `/api/rules/${id}` : '/api/rules', { method: 'POST', body })
}

export async function removeRule(s: Session, id: string): Promise<{ resorted: number }> {
  return await s.send(`/api/rules/${id}/remove`, { method: 'POST' })
}

export async function setMerchantRule(
  s: Session,
  id: string,
  category: string,
): Promise<{ rule: MerchantRule, moved: number }> {
  return await s.send(`/api/merchant-rules/${id}`, { method: 'POST', body: { category } })
}

export async function removeMerchantRule(s: Session, id: string): Promise<{ resorted: number }> {
  return await s.send(`/api/merchant-rules/${id}/remove`, { method: 'POST' })
}
