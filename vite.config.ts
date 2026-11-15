import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/whiskers/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      // dev-sprites.html es solo de desarrollo: no entra en el build.
      input: { main: new URL('./index.html', import.meta.url).pathname },
    },
  },
  server: { host: true },
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['gen/**/*'],
      manifest: {
        name: 'Whiskers',
        short_name: 'Whiskers',
        description: 'Un juego tranquilo: cuida a los gatos y perros callejeros de un barrio con encanto.',
        lang: 'es',
        start_url: '/whiskers/',
        scope: '/whiskers/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#2b2d5c',
        theme_color: '#3b3149',
        categories: ['games', 'entertainment'],
        icons: [
          { src: 'gen/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'gen/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'gen/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,json,woff,woff2,svg,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/whiskers/index.html',
        // recordatorio diario opcional (Periodic Background Sync)
        importScripts: ['reminder-sw.js'],
      },
      devOptions: { enabled: false },
    }),
  ],
});
