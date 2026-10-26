import { expect, test } from '@playwright/test'
import { openMap, readState } from './helpers'

test('渲染地图并加载 Cesium 静态资源', async ({ page }) => {
  const failed: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/cesium/') && response.status() >= 400) {
      failed.push(`${response.status()} ${response.url()}`)
    }
  })

  await openMap(page)

  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    return { width: canvas?.width ?? 0, height: canvas?.height ?? 0 }
  })
  expect(canvasSize.width).toBeGreaterThan(100)
  expect(canvasSize.height).toBeGreaterThan(100)
  expect(failed).toEqual([])
})

test('默认状态与底图', async ({ page }) => {
  await openMap(page)
  const state = await readState(page)

  expect(state.imagery).toEqual(['naturalEarth', 'osm'])
  expect(state.activeImagery).toBe('naturalEarth')
  expect(state.mode).toBe('3D')
  expect(state.features).toEqual([])
})
