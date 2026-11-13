import { localToday } from './categories.ts'

/**
 * Each person's time zone (users.time_zone, an IANA name such as
 * "America/Los_Angeles"), so "today" is their day, not the server's: the pods
 * run in UTC, which is already tomorrow on a US evening. Empty means not known
 * yet; the browser fills it in from the device the first time someone signs in.
 */

export const TIME_ZONE_MAX = 64

/** Whether `zone` is a time zone name this runtime knows. */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone || zone.length > TIME_ZONE_MAX) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  }
  catch {
    return false
  }
}

/** The time zone of the device this runs on, or '' if it can't say. */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isTimeZone(zone) ? zone : ''
  }
  catch {
    return ''
  }
}

/**
 * Today as YYYY-MM-DD in `zone`; where this code runs when the zone is empty
 * or unknown.
 */
export function todayIn(zone: string | undefined, now = new Date()): string {
  if (!isTimeZone(zone)) return localToday(now)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The zones the 50 states and DC keep, east to west, by the names people use. */
export const US_ZONES: { zone: string, label: string }[] = [
  { zone: 'America/New_York', label: 'Eastern (New York)' },
  { zone: 'America/Detroit', label: 'Eastern (Detroit)' },
  { zone: 'America/Indiana/Indianapolis', label: 'Eastern (Indianapolis)' },
  { zone: 'America/Chicago', label: 'Central (Chicago)' },
  { zone: 'America/Denver', label: 'Mountain (Denver)' },
  { zone: 'America/Boise', label: 'Mountain (Boise)' },
  { zone: 'America/Phoenix', label: 'Mountain, no daylight saving (Phoenix)' },
  { zone: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { zone: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { zone: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
]

/** "Europe/Isle_of_Man" as "Europe / Isle of Man"; a US zone by its everyday name. */
export function timeZoneLabel(zone: string): string {
  return US_ZONES.find(z => z.zone === zone)?.label ?? zone.replace(/_/g, ' ').replace(/\//g, ' / ')
}

/**
 * Every zone to choose from: the US ones first, then every other this
 * runtime knows by name, and `keep` (the saved one) even if it knows none.
 */
export function timeZoneChoices(keep = ''): { zone: string, label: string }[] {
  const us = US_ZONES.filter(z => isTimeZone(z.zone)).map(z => z.zone)
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const zones = [...us, ...all.filter(z => !us.includes(z))]
  if (keep && !zones.includes(keep)) zones.push(keep)
  return zones.map(zone => ({ zone, label: timeZoneLabel(zone) }))
}
