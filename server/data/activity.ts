import type { ActivityEvent } from '~~/shared/activity'
import { callerId, type Session } from './session'

/**
 * The person's recent activity, newest first (security_events, written only
 * by the hooks; shared/activity.ts). `limit` rows, or every row kept (90 days).
 */
export async function listActivity(s: Session, limit?: number): Promise<ActivityEvent[]> {
  const options = {
    sort: '-created,-id',
    fields: 'kind,device,place,detail,created',
    filter: s.filter('user = {:user}', { user: callerId(s) }),
  }
  const rows = limit
    ? (await s.collection('security_events').getList(1, limit, options)).items
    : await s.collection('security_events').getFullList(options)
  return rows.map(r => ({ kind: r.kind, device: r.device, place: r.place, detail: r.detail, created: r.created }))
}
