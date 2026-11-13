import { deviceTimeZone, todayIn } from '~~/shared/time-zone'

/**
 * Today as YYYY-MM-DD in the signed-in person's own time zone (Settings), or
 * this device's until they have one, so the page and the server agree on the
 * day even when the server renders it in UTC.
 */
export function useToday(): string {
  const { me } = useAuth()
  return todayIn(me.value?.time_zone || (import.meta.client ? deviceTimeZone() : ''))
}
