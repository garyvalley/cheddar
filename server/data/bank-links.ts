import type { BankLinks, LinkAnswer } from '~~/shared/bank-links'
import type { Session } from './session'

/**
 * Bank links through Plaid: the routes in pb_hooks/bank_links.pb.js, called
 * as the signed-in person. The hooks hold each link's access token, which
 * never reaches Nuxt or the browser.
 */

export function listLinks(s: Session): Promise<BankLinks> {
  return s.send('/api/bank-links', { method: 'GET' })
}

/** A link_token for Plaid Link: for a new link, or with `link`, to sign in to that bank again. */
export function linkToken(s: Session, link?: string): Promise<{ link_token: string }> {
  return s.send('/api/bank-links/link-token', { method: 'POST', body: link ? { link } : {} })
}

/** Swaps the public_token Plaid Link handed the page for a link, then syncs it. */
export function addLink(s: Session, publicToken: string, institution: string): Promise<LinkAnswer> {
  return s.send('/api/bank-links', { method: 'POST', body: { public_token: publicToken, institution } })
}

/** `reconnected`: the person just signed in to the bank again, so sync even if it synced moments ago. */
export function syncLink(s: Session, id: string, reconnected = false): Promise<LinkAnswer> {
  return s.send(`/api/bank-links/${encodeURIComponent(id)}/sync`, { method: 'POST', body: { reconnected } })
}

/** Removes a link; its accounts and transactions stay, no longer syncing. */
export async function removeLink(s: Session, id: string): Promise<void> {
  await s.send(`/api/bank-links/${encodeURIComponent(id)}/remove`, { method: 'POST' })
}
