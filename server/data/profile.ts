import type { RecordModel } from 'pocketbase'
import type { Me, Profile } from '~~/shared/profile'
import { DEFAULT_APPEARANCE, DEFAULT_THEME, isAppearance, isTheme } from '~~/shared/theme'
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
  }
}

/** Saves the caller's own profile fields (already checked by checkProfile()). */
export async function updateProfile(s: Session, change: Partial<Profile>): Promise<Me> {
  return toMe(await s.collection('users').update(callerId(s), change))
}
