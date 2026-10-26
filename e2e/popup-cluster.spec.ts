import { expect, test } from '@playwright/test'
import { openMap, readLayerTree } from './helpers'

test('示例弹窗打开与关闭', async ({ page }) => {
  await openMap(page)
  const panel = page.locator('.cesium-panel', { hasText: '标注与弹窗' }).first()

  await panel.getByRole('button', { name: '打开示例弹窗' }).click()
  await expect(page.locator('.cesium-kit-popup')).toBeVisible()
  await expect(page.locator('.cesium-kit-popup')).toContainText('示例弹窗')

  await panel.getByRole('button', { name: '关闭全部' }).click()
  await expect(page.locator('.cesium-kit-popup')).toHaveCount(0)
})

test('城市标注聚合加入图层树并可点击打开弹窗', async ({ page }) => {
  await openMap(page)
  const panel = page.locator('.cesium-panel', { hasText: '标注与弹窗' }).first()
  const markerSwitch = panel.locator('.el-switch').first()

  await markerSwitch.evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await expect
    .poll(async () => {
      const tree = await readLayerTree(page)
      const group = tree.find((node) => node.name === '城市标注')
      return group?.entityCount ?? 0
    })
    .toBe(6)

  await page.evaluate(() => {
    window.__cesiumKit!.camera.setView({ lon: 116.39, lat: 39.9, height: 300_000 })
  })
  await page.waitForTimeout(600)

  const screen = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 116.3913, lat: 39.9075, height: 0 })
  )
  expect(screen).toBeTruthy()
  if (!screen) return

  const box = await page.locator('canvas').first().boundingBox()
  expect(box).toBeTruthy()
  if (!box) return

  await page.mouse.click(box.x + screen.x, box.y + screen.y)
  await expect
    .poll(async () => page.evaluate(() => window.__cesiumKit!.popup.size), {
      timeout: 10_000
    })
    .toBeGreaterThan(0)
  await expect(page.locator('.cesium-kit-popup')).toContainText('北京')
})
