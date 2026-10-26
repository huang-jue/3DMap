import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        'farm/index': 'src/farm/index.ts'
      },
      formats: ['es']
    },
    rollupOptions: {
      external: [/^cesium/, /^@cesium\//, /^@sgyx\/cesium-kit-/, 'cesium-wind-layer'],
      output: {
        entryFileNames: '[name].js'
      }
    }
  },
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts'],
      tsconfigPath: './tsconfig.json'
    })
  ]
})
