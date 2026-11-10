// Vite's dev server injects inline and eval'd script that no nonce covers, so
// dev relaxes script-src; the production build gets the strict policy.
const dev = process.env.NODE_ENV !== 'production'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  // Production reads neither, and they would bloat .output.
  sourcemap: { server: false, client: false },

  modules: ['@nuxt/eslint', 'nuxt-security'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      // viewport-fit=cover lets env(safe-area-inset-*) report the iPhone home
      // indicator, which the phone tab bar pads for.
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        // Add to Home Screen opens Cheddar full screen with its own icon.
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'theme-color', content: '#F6F5F9', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#141318', media: '(prefers-color-scheme: dark)' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Cheddar' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'description', content: 'Your accounts, net worth, spending and taxes in one place.' },
        // Nothing here is for a search engine.
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  devServer: { port: Number(process.env.NUXT_DEV_PORT || 3005) },

  runtimeConfig: {
    // Server-only: the browser never talks to PocketBase.
    pocketbaseUrl: 'http://127.0.0.1:8095',
  },

  // Security headers come from nuxt-security: script-src needs a per-request
  // nonce, which a static header can't carry.
  security: {
    nonce: true,
    headers: {
      contentSecurityPolicy: {
        'default-src': ['\'self\''],
        'manifest-src': ['\'self\''],
        // Plaid Link's script must come from Plaid itself (BankLinks.vue loads it
        // when someone links a bank), and it opens the bank sign-in in a frame.
        'script-src': dev
          ? ['\'self\'', '\'nonce-{{nonce}}\'', '\'unsafe-inline\'', '\'unsafe-eval\'', 'https://cdn.plaid.com']
          : ['\'self\'', '\'nonce-{{nonce}}\'', 'https://cdn.plaid.com'],
        'frame-src': ['https://cdn.plaid.com'],
        // Vue writes component styles inline; a style can't run code.
        'style-src': ['\'self\'', '\'unsafe-inline\''],
        'img-src': ['\'self\'', 'data:', 'blob:'],
        'connect-src': ['\'self\'', 'https://production.plaid.com', 'https://sandbox.plaid.com'],
        'font-src': ['\'self\''],
        'object-src': ['\'none\''],
        'frame-ancestors': ['\'none\''],
        'base-uri': ['\'self\''],
        'form-action': ['\'self\''],
        'upgrade-insecure-requests': !dev,
      },
      // Cloudflare terminates TLS; HSTS from the app covers every path.
      strictTransportSecurity: dev ? false : { maxAge: 31536000, includeSubdomains: true },
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'no-referrer',
      permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
      crossOriginEmbedderPolicy: false,
    },
    // The module's request-side middleware stays off: nginx rate-limits by
    // the real client address (nginx/nginx.conf.template); xssValidator
    // rewrites request bodies; CORS is never wanted.
    rateLimiter: false,
    xssValidator: false,
    corsHandler: false,
    requestSizeLimiter: { maxRequestSizeInBytes: 1_000_000, maxUploadFileRequestInBytes: 10_000_000 },
    removeLoggers: false,
  },

  routeRules: {
    // A statement file of up to 4 MB, sent as JSON text (shared/statements.ts);
    // nginx allows the same for this route alone.
    '/api/imports': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 8_000_000 } } },
  },
})
