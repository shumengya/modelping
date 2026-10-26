import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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
  plugins: [react(), cloudflare()],
})
