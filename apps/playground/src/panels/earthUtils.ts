export function formatEarthTime(value: Date | null | undefined): string {
  if (!value || !Number.isFinite(value.getTime())) return '-'
  return new Date(value.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
}
export function saveFile(name: string, contents: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export interface EarthWorkspaceState {
  plugin: import('@sgyx/cesium-kit-earth').EarthPluginState
  point: { lon: number; lat: number } | null
  drawer: string
  drawerOpen: boolean
  comparison: import('@sgyx/cesium-kit-earth').EarthCompareState | null
  frustumWidth?: number
}
