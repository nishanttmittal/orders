import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/orders/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: '/orders/',
      includeAssets: ['apple-touch-icon.png'],
      workbox: { navigateFallback: '/orders/index.html', navigateFallbackAllowlist: [/^\/orders/] },
      manifest: {
        name: 'UNICO Orders',
        short_name: 'Orders',
        description: 'UNICO order book — client orders, production status & dispatch',
        theme_color: '#1d4ed8',
        background_color: '#f1f5f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/orders/',
        scope: '/orders/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
