// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // pb_hooks/lib/gen/ is built from shared/ (scripts/gen-hooks.mjs); its source is linted.
  { ignores: ['pb_data/**', '.output/**', 'public/**', 'pb_hooks/lib/gen/**'] },
  {
    // The browser never talks to PocketBase: it calls the app's own routes.
    files: ['app/**', 'shared/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'pocketbase', message: 'The browser calls the app\'s /api routes, never PocketBase.' }],
      }],
    },
  },
  {
    // PocketBase's JSVM: CommonJS with its own globals ($app, routerAdd...).
    files: ['pb_hooks/**'],
    languageOptions: { sourceType: 'commonjs', globals: { __hooks: 'readonly' } },
    rules: { 'no-var': 'off', 'no-undef': 'off', 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Short guards stay on one line (`if (!x) { a(); return }`).
    rules: { '@stylistic/max-statements-per-line': 'off' },
  },
  {
    // Templates keep their hand-made line breaks: the style is about quotes
    // and semicolons, not where an element's attributes go.
    files: ['**/*.vue'],
    rules: {
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
    },
  },
).onResolved((configs) => {
  // The hooks keep their own ES5 style (double quotes, semicolons): every
  // style rule (nuxt.config.ts `eslint.config.stylistic`) is off for them.
  const style = new Set(configs.flatMap(c => Object.keys(c.rules ?? {})).filter(r => r.startsWith('@stylistic/')))
  configs.push({ name: 'cheddar/pb-hooks-style', files: ['pb_hooks/**'], rules: Object.fromEntries([...style].map(r => [r, 'off'])) })
})
