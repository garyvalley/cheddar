/**
 * A button's request: `busy` while it runs (the button shows a spinner at
 * once, so no tap waits without one), and the server's message in `error`
 * if it fails.
 */
export function useAction() {
  const busy = ref(false)
  const error = ref('')

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    busy.value = true
    error.value = ''
    try {
      return await work()
    }
    catch (e) {
      error.value = errorMessage(e)
      return undefined
    }
    finally {
      busy.value = false
    }
  }

  return { busy, error, run }
}
