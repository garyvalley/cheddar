import type { RecordModel } from 'pocketbase'
import type { Me, Profile } from '~~/shared/profile'
import { DEFAULT_APPEARANCE, DEFAULT_THEME, isAppearance, isTheme } from '~~/shared/theme'
import { isTimeZone, todayIn } from '~~/shared/time-zone'
import { callerId, type Session } from './session'

export function toMe(r: RecordModel): Me {
  return {
    id: r.id,
    email: r.email,
    verified: !!r.verified,
    mfa_enabled: !!r.mfa_enabled,
    name: r.name ?? '',
    state: r.state ?? '',
    filing_status: r.filing_status ?? '',
    theme: isTheme(r.theme) ? r.theme : DEFAULT_THEME,
    appearance: isAppearance(r.appearance) ? r.appearance : DEFAULT_APPEARANCE,
    time_zone: isTimeZone(r.time_zone) ? r.time_zone : '',
  }
}

/** Saves the caller's own profile fields (already checked by checkProfile()). */
export async function updateProfile(s: Session, change: Partial<Profile>): Promise<Me> {
  return toMe(await s.collection('users').update(callerId(s), change))
}

/**
 * Today as YYYY-MM-DD in the caller's own time zone (users.time_zone), not
 * the server's UTC; the server's day only for someone whose zone isn't known.
 */
export async function todayFor(s: Session, now = new Date()): Promise<string> {
  const r = await s.collection('users').getOne(callerId(s), { fields: 'time_zone' })
  return todayIn(r.time_zone, now)
}
