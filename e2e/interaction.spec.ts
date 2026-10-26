import { expect, test } from '@playwright/test'
import { openMap, readState, toggleSwitch } from './helpers'

test('切换底图与投影并保持视角', async ({ page }) => {
  await openMap(page)
  const before = await page.evaluate(
    () => window.__cesiumKit!.camera.getView() as { lon: number; lat: number }
  )

  await page.evaluate(() => window.__cesiumKit!.imagery.switchTo('osm'))
  await expect.poll(async () => (await readState(page)).activeImagery).toBe('osm')

  await page.evaluate(() => window.__cesiumKit!.scene.setMode('2D'))
  await page.waitForTimeout(2500)
  expect((await readState(page)).mode).toBe('2D')

  const in2d = await page.evaluate(
    () => window.__cesiumKit!.camera.getView() as { lon: number; lat: number }
  )
  expect(Math.abs(in2d.lon - before.lon)).toBeLessThan(1)
  expect(Math.abs(in2d.lat - before.lat)).toBeLessThan(1)

  await page.evaluate(() => window.__cesiumKit!.scene.setMode('3D'))
  await page.waitForTimeout(2500)
  expect((await readState(page)).mode).toBe('3D')
})

test('2D 下坐标拾取可用', async ({ page }) => {
  await openMap(page)
  await page.evaluate(() => window.__cesiumKit!.scene.setMode('2D'))
  await page.waitForTimeout(2500)

  const picked = await page.evaluate(() => window.__cesiumKit!.coords.pickPosition())
  expect(picked).toBeTruthy()
  expect(picked?.source).toBe('ellipsoid')
})

test('城市标注插件注册与回收', async ({ page }) => {
  await openMap(page)
  expect((await readState(page)).entities).toBe(0)

  await toggleSwitch(page, '场景控制', 0)
  await expect
    .poll(async () => (await readState(page)).entities, { timeout: 10_000 })
    .toBe(8)

  await toggleSwitch(page, '场景控制', 0)
  await expect
    .poll(async () => (await readState(page)).entities, { timeout: 10_000 })
    .toBe(0)
})
