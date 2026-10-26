import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    target: 'node22',
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [/^vite/, /^node:/, 'vite-plugin-static-copy']
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

