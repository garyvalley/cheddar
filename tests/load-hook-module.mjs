// Loads a pb_hooks library for a unit test. Shared by the tests of the
// hook libraries (warranty-reminders, notify); not itself a test file.

import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const hooks = join(root, 'pb_hooks')

/**
 * Load a pb_hooks CommonJS module.
 *
 * This package is `"type": "module"`, so Node parses a bare `.js` file as ESM
 * and `module.exports` silently yields nothing. PocketBase's JSVM has its own
 * CommonJS require and is unaffected, so the hooks keep their established
 * shape and the test does the adapting.
 *
 * A lib may require() another by `${__hooks}/lib/<name>.js`, as the hooks do:
 * `require` and `__hooks` are passed in so that resolves here too.
 */
export function loadHookModule(relativePath) {
  const source = readFileSync(join(root, relativePath), 'utf8')
  const module = { exports: {} }
  // runInThisContext, not runInNewContext: a separate realm hands back arrays
  // whose prototype differs from this one's, and assert.deepEqual rejects
  // those even when every element matches.
  vm.runInThisContext(
    `(function (module, exports, require, __hooks) {\n${source}\n})`,
    { filename: relativePath },
  )(module, module.exports, (path) => loadHookModule(relative(root, path)), hooks)
  return module.exports
}
