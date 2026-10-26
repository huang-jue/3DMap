import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'style'
    },
    rollupOptions: {
      external: [/^cesium/, /^@cesium\//, 'vue', /^@cesium-kit\//]
    }
  },
  plugins: [
    vue(),
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      tsconfigPath: './tsconfig.json'
    })
  ]
})

