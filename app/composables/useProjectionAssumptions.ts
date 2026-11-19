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
      if (raw) restore(saved, JSON.parse(raw))
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

/** Puts back what this browser kept, field by field: anything else in it is left out. */
function restore(saved: Saved, kept: unknown) {
  if (!kept || typeof kept !== 'object') return
  const k = kept as Record<string, unknown>
  if (typeof k.years === 'number') saved.years = k.years
  if (typeof k.returnPct === 'number') saved.returnPct = k.returnPct
  if (typeof k.monthly === 'string') saved.monthly = k.monthly
  if (typeof k.extra === 'string') saved.extra = k.extra
  if (k.debts && typeof k.debts === 'object') {
    for (const [id, d] of Object.entries(k.debts as Record<string, unknown>)) {
      if (!d || typeof d !== 'object' || id === '__proto__') continue
      const { payment, apr } = d as Record<string, unknown>
      saved.debts[id] = {
        ...(typeof payment === 'string' ? { payment } : {}),
        ...(typeof apr === 'string' ? { apr } : {}),
      }
    }
  }
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
