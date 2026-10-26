import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cesiumAssets } from '@cesium-kit/vite'

export default defineConfig({
  plugins: [vue(), cesiumAssets()],
  server: {
    port: 5444,
    strictPort: true
  }
})
