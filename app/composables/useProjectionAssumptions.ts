/**
 * Projections' assumptions (years, growth, the monthly amount, the extra for
 * paying debts together, each debt's payment and APR), kept only in this
 * browser's localStorage, per person, and read back when the page opens.
 */
export interface Saved { years: number, returnPct: number, monthly: string, extra: string, debts: Record<string, { payment?: string, apr?: string }> }

export function useProjectionAssumptions() {
  const { me } = useAuth()
  const key = computed(() => `cheddar:projections:${me.value?.id ?? ''}`)
  const saved = reactive<Saved>({ years: 25, returnPct: 5, monthly: '', extra: '', debts: {} })
  onMounted(() => {
    try {
      const raw = localStorage.getItem(key.value)
      if (raw) Object.assign(saved, JSON.parse(raw))
    }
    catch { /* nothing remembered */ }
  })
  watch(saved, () => {
    try { localStorage.setItem(key.value, JSON.stringify(saved)) }
    catch { /* not remembered, still works */ }
  }, { deep: true })
  /** One debt's typed payment or APR. */
  function setDebt(id: string, field: 'payment' | 'apr', value: string) {
    saved.debts[id] = { ...saved.debts[id], [field]: value }
  }
  return { saved, setDebt }
}

/** A dollar amount typed in a box, as cents; null when it isn't one. */
export function parseDollars(text: string | undefined): number | null {
  const t = (text ?? '').replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}
/** A percentage typed in a box (0 to 100), as a fraction; null when it isn't one. */
export function parsePercent(text: string | undefined): number | null {
  const t = (text ?? '').replace(/[%\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(t) || Number(t) > 100) return null
  return Number(t) / 100
}
