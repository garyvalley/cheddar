import { isFilingStatus, type FilingStatus } from './filing-status.ts'
import { stateByCode } from './states.ts'
import { isTimeZone } from './time-zone.ts'
import { isAppearance, isTheme, type Appearance, type Theme } from './theme.ts'

/** What a person tells Cheddar about themselves; '' is "not chosen yet". */
export interface Profile {
  name: string
  state: string
  filing_status: FilingStatus | ''
  theme: Theme
  appearance: Appearance
  /** IANA name, such as "America/Los_Angeles" (shared/time-zone.ts); '' until known. */
  time_zone: string
}

/** The signed-in person, as the browser is told about them. */
export interface Me extends Profile {
  id: string
  email: string
  verified: boolean
  mfa_enabled: boolean
}

export const NAME_MAX = 100

/**
 * The fields of a profile change that are allowed through, or the first
 * problem as a message. Only the keys present are checked and returned, so a
 * change can be partial.
 */
export function checkProfile(input: Record<string, unknown>): { ok: Partial<Profile> } | { problem: string } {
  const ok: Partial<Profile> = {}
  if ('name' in input) {
    if (typeof input.name !== 'string' || input.name.trim().length > NAME_MAX) {
      return { problem: `Name must be at most ${NAME_MAX} characters.` }
    }
    ok.name = input.name.trim()
  }
  if ('state' in input) {
    if (input.state !== '' && !stateByCode(input.state)) return { problem: 'Choose a US state or DC.' }
    ok.state = input.state as string
  }
  if ('filing_status' in input) {
    if (input.filing_status !== '' && !isFilingStatus(input.filing_status)) return { problem: 'Choose a filing status.' }
    ok.filing_status = input.filing_status as FilingStatus | ''
  }
  if ('theme' in input) {
    if (!isTheme(input.theme)) return { problem: 'Choose a color theme.' }
    ok.theme = input.theme
  }
  if ('appearance' in input) {
    if (!isAppearance(input.appearance)) return { problem: 'Choose light, dark or automatic.' }
    ok.appearance = input.appearance
  }
  if ('time_zone' in input) {
    if (input.time_zone !== '' && !isTimeZone(input.time_zone)) return { problem: 'Choose a time zone.' }
    ok.time_zone = input.time_zone as string
  }
  return { ok }
}
