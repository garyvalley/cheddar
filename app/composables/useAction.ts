/**
 * A button's request: `busy` while it runs (the button shows a spinner at
 * once, so no tap waits without one), and the server's message in `error`
 * if it fails.
 *
 * `run` hands back what the request answered, or undefined when it failed.
 * A request that answers 204 No Content also hands back undefined when it
 * succeeds, so for those use `succeed`, which says plainly whether it worked.
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

  /** For a request with no content to answer: true once it has succeeded. */
  async function succeed(work: () => Promise<unknown>): Promise<boolean> {
    await run(work)
    return !error.value
  }

  return { busy, error, run, succeed }
}
