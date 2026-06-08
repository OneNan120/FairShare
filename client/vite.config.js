import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

globalThis.require = createRequire(import.meta.url);
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

export default defineConfig(async () => {
  const { VitePWA } = await import('vite-plugin-pwa');
  return {
    plugins: [
      react(),
      VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'FairShare',
        short_name: 'FairShare',
        description: 'AI-assisted receipt splitting for shared expenses.',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: '64x64', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        navigateFallback: '/index.html'
      }
      })
    ],
    server: { proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } } }
  };
});
