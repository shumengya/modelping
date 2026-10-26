import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { cloudflare } from '@cloudflare/vite-plugin'

const projRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root: path.resolve(projRoot, 'frontend'),
  publicDir: path.resolve(projRoot, 'public'),
  build: {
    outDir: path.resolve(projRoot, 'dist/client'),
    emptyOutDir: true,
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'logo192.png'],
      // manifest 里的图标默认会被自动加入预缓存；logo512 只在安装 PWA 时才需要，不必让首次访问去下载
      includeManifestIcons: false,
      manifest: {
        name: 'ModelPing',
        short_name: 'ModelPing',
        description: '大模型 API 可用性与首字延迟监控',
        theme_color: '#27ae60',
        background_color: '#dfe6eb',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: 'logo192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'logo512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'logo512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // logo.png(1.4MB)已无页面引用，logo512 只给 PWA 安装图标用，浏览器按需下载，不必在首次访问时预缓存
        globIgnores: ['logo.png', 'logo512.png'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 字体来自自建 CDN，不进 precache，首次访问后缓存一年以便离线可用
            urlPattern: /^https:\/\/cdn\.smyhub\.com\/fonts\/.*\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-fonts',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    cloudflare(),
  ],
})
