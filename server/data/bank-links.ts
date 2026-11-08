import type { BankLinks, LinkAnswer } from '~~/shared/bank-links'
import type { Session } from './session'

/**
 * Bank links through SimpleFIN: the routes in pb_hooks/bank_links.pb.js,
 * called as the signed-in person. The hooks hold each link's access, which
 * never reaches Nuxt or the browser.
 */

export function listLinks(s: Session): Promise<BankLinks> {
  return s.send('/api/bank-links', { method: 'GET' })
}

/** Spends a SimpleFIN setup token, then syncs the new link. */
export function addLink(s: Session, setupToken: string): Promise<LinkAnswer> {
  return s.send('/api/bank-links', { method: 'POST', body: { setup_token: setupToken } })
}

export function syncLink(s: Session, id: string): Promise<LinkAnswer> {
  return s.send(`/api/bank-links/${encodeURIComponent(id)}/sync`, { method: 'POST' })
}

/** Removes a link; its accounts and transactions stay, no longer syncing. */
export async function removeLink(s: Session, id: string): Promise<void> {
  await s.send(`/api/bank-links/${encodeURIComponent(id)}/remove`, { method: 'POST' })
}
