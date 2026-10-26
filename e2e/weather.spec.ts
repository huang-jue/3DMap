import { expect, test } from '@playwright/test'
import { openMap, readImageryLayerCount, readLayerTree, readState, toggleSwitch } from './helpers'

test('天气预报多图层启停与时间范围切换', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openMap(page)

  const before = await readImageryLayerCount(page)
  await toggleSwitch(page, '天气预报', 0)
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 20_000 })
    .toContain('weather-plugin')
  await expect
    .poll(() => readImageryLayerCount(page), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(before + 1)

  const panel = page.locator('.cesium-panel', { hasText: '天气预报' }).first()
  await expect(panel.locator('.frame')).not.toHaveText('-')
  await expect(panel.locator('.legend')).toBeVisible()
  await expect.poll(async () => JSON.stringify(await readLayerTree(page))).toContain('天气图层')
  await expect
    .poll(async () => JSON.stringify(await readLayerTree(page)))
    .toContain('weather-layer:points')
  await expect
    .poll(async () => JSON.stringify(await readLayerTree(page)))
    .toContain('weather-layer:warnings')

  await toggleSwitch(page, '天气预报', 2)
  await expect(panel.locator('.el-switch').nth(2)).toHaveClass(/is-checked/)
  await expect
    .poll(() => readImageryLayerCount(page), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(before + 2)

  await panel.getByRole('button', { name: '12h', exact: true }).click()
  await expect(panel.locator('.meta.mono', { hasText: '2026-07-01' })).toBeVisible()

  await toggleSwitch(page, '天气预报', 6)
  await page.evaluate(() =>
    window.__cesiumKit!.camera.setView({ lon: 114.3, lat: 30.6, height: 200_000 })
  )
  await page.waitForTimeout(800)
  const city = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 114.3, lat: 30.6, height: 0 })
  )
  expect(city).toBeTruthy()
  const canvas = await page.locator('canvas').boundingBox()
  expect(canvas).toBeTruthy()
  await page.mouse.click(canvas!.x + city!.x, canvas!.y + city!.y)
  await expect(page.locator('.cesium-kit-popup', { hasText: '武汉' })).toBeVisible()

  await toggleSwitch(page, '天气预报', 0)
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 15_000 })
    .not.toContain('weather-plugin')
  await expect.poll(() => readImageryLayerCount(page)).toBe(before)
  expect(errors).toEqual([])
})
