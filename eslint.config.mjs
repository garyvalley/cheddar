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
)
