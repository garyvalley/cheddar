import { NO_ALERTS, type AlertSettings } from '~~/shared/alerts'
import { callerId, type Session } from './session'

/**
 * The person's alert settings (shared/alerts.ts), one row each in
 * `alert_settings`; none until they turn one on. The hooks send them
 * (pb_hooks/alerts.pb.js).
 */

type Row = AlertSettings & { id: string }

async function find(s: Session): Promise<Row | null> {
  return (await s
    .collection('alert_settings')
    .getFirstListItem(s.filter('owner = {:owner}', { owner: callerId(s) }))
    .catch((e: { status?: number }) => {
      if (e?.status === 404) return null
      throw e
    })) as Row | null
}

const toSettings = (r: Partial<AlertSettings> | null): AlertSettings => ({
  charge_over_cents: r?.charge_over_cents ?? 0,
  balance_under_cents: r?.balance_under_cents ?? 0,
  bills: !!r?.bills,
  budgets: !!r?.budgets,
  banks: !!r?.banks,
  weekly: !!r?.weekly,
})

export async function getAlertSettings(s: Session): Promise<AlertSettings> {
  return toSettings(await find(s))
}

export async function saveAlertSettings(s: Session, settings: AlertSettings): Promise<AlertSettings> {
  const found = await find(s)
  const saved = found
    ? await s.collection('alert_settings').update(found.id, settings)
    : await s.collection('alert_settings').create({ ...NO_ALERTS, ...settings, owner: callerId(s) })
  return toSettings(saved as unknown as AlertSettings)
}

/** Looks now, as the daily run would, and emails what's new: the alerts sent, in words. */
export function checkAlertsNow(s: Session): Promise<{ sent: string[] }> {
  return s.send('/api/alerts/check', { method: 'POST' })
}
