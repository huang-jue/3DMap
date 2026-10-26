import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [/^cesium/, /^@cesium\//]
    }
  },
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      tsconfigPath: './tsconfig.json'
    })
  ]
})

