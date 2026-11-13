// Builds the TypeScript in shared/ that the PocketBase hooks use too into
// pb_hooks/lib/gen/, as CommonJS PocketBase's JSVM can require() (issue #34):
// one source for rules both sides apply, instead of two copies kept equal
// by hand.
//
//   node scripts/gen-hooks.mjs          write the files
//   node scripts/gen-hooks.mjs --check  fail if one is missing or stale (CI)
//
// The files are checked in, because the PocketBase image copies pb_hooks/ as
// it is. Each must stay pure: plain values in and out, nothing that needs a
// browser or Node, as the hooks run it in goja.
import { build } from 'esbuild'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = `${ROOT}pb_hooks/lib/gen/`

/** pb_hooks/lib/gen/<name>.js from shared/<name>.ts. */
export const MODULES = ['categories', 'overlap', 'splits']

const HEADER = name => `/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/${name}.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/${name}.ts and run \`pnpm gen:hooks\`.
`

export async function generate(name) {
  const r = await build({
    entryPoints: [`${ROOT}shared/${name}.ts`],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'neutral',
    // goja, PocketBase's JS engine, runs ES2015 and some later features; this
    // keeps esbuild from emitting anything newer.
    target: 'es2015',
    legalComments: 'none',
    charset: 'utf8',
  })
  return HEADER(name) + r.outputFiles[0].text
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check')
  const stale = []
  for (const name of MODULES) {
    const want = await generate(name)
    const path = `${OUT}${name}.js`
    let have = ''
    try { have = readFileSync(path, 'utf8') }
    catch { /* not made yet */ }
    if (have === want) continue
    if (check) stale.push(name)
    else writeFileSync(path, want)
  }
  const extra = readdirSync(OUT).filter(f => !MODULES.includes(f.replace(/\.js$/, '')))
  if (check && (stale.length || extra.length)) {
    console.error(`pb_hooks/lib/gen/ is out of date (${[...stale, ...extra].join(', ')}): run pnpm gen:hooks and commit it.`)
    process.exit(1)
  }
}
