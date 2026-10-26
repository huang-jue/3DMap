/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string
  readonly VITE_ENABLE_WIND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
