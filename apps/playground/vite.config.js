import path from 'node:path'
import { realpathSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cesiumAssets } from '@sgyx/cesium-kit-vite'

const cesiumDir = fileURLToPath(new URL('./node_modules/cesium', import.meta.url))
const cesiumEngine = path.resolve(realpathSync(cesiumDir), '../@cesium/engine')

export default defineConfig({
  plugins: [vue(), cesiumAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@cesium/engine': cesiumEngine
    },
    dedupe: ['cesium', '@cesium/engine', '@cesium/widgets']
  },
  server: {
    port: 5173,
    open: true
  },
  build: {
    chunkSizeWarningLimit: 4096
  }
})
