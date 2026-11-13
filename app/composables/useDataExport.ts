/**
 * Downloads everything the person has (POST /api/export) as a zip, after
 * their password: Settings' "Export your data", and the Delete account flow,
 * which offers it first. `busy` and `error` as useAction's.
 */
export function useDataExport() {
  const { busy, error, succeed } = useAction()

  function download(password: string): Promise<boolean> {
    return succeed(async () => {
      // fetch, not $fetch: the answer is a file, and a refusal is JSON.
      const r = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!r.ok) throw Object.assign(new Error('Export refused'), { data: await r.json().catch(() => ({})) })
      const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'cheddar-export.zip'
      saveFile(await r.blob(), name)
    })
  }

  return { busy, error, download }
}

/** Hands the browser a file to save, as a link to it would. */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
