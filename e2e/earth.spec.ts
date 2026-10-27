import { expect, test, type Page } from '@playwright/test'
import { openMap, readImageryLayerCount, readPrimitiveCount, readState } from './helpers'

async function enterEarth(page: Page) {
  await openMap(page)
  await page.locator('.header').getByRole('button', { name: '地球模式' }).click()
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 40_000 })
    .toContain('earth-plugin')
  await expect(page.locator('.earth-data-card')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.earth-wind-trails')).toBeVisible()
}

async function openControls(page: Page) {
  if (!(await page.locator('.earth-panel').isVisible()))
    await page.getByRole('button', { name: '切换控制面板' }).click()
  await expect(page.locator('.earth-panel')).toBeVisible()
  return page.locator('.earth-panel')
}

async function useSamples(page: Page) {
  const panel = await openControls(page)
  await panel.locator('.el-select').first().click()
  await page.getByRole('option', { name: '合成样例 · 六种模式' }).click()
  await expect(panel).toContainText('Static synthetic demo')
  await expect(panel.locator('.earth-grid-2')).toContainText('温度')
  return panel
}

async function trailPixels(page: Page) {
  return page.locator('.earth-wind-trails').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 16) count++
    return count
  })
}

test('PM2.5 直达、真实浓度、正交球面、时间切换与风场回切', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  await page.goto('/?earth=pm25')
  await expect(page.locator('.earth-data-card')).toContainText('CAMS / 真实颗粒物预报', {
    timeout: 100_000
  })
  await expect(page.locator('.earth-data-card')).toContainText('0.4° 全球网格')
  await expect(page.locator('.earth-data-card')).toContainText('µg/m³')
  const orthographic = () =>
    page.evaluate(() => {
      const viewer = window.__cesiumKit!.getViewer() as unknown as {
        camera: { frustum: { width?: number } }
      }
      return typeof viewer.camera.frustum.width === 'number'
    })
  await expect.poll(orthographic).toBe(true)
  await expect.poll(() => trailPixels(page), { timeout: 30_000 }).toBeGreaterThan(300)
  const point = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 110, lat: 30 })
  )
  await page.mouse.click(point!.x, point!.y)
  await expect(page.locator('.earth-readout-card')).toContainText('PM2.5')
  await expect(page.locator('.earth-readout-card')).toContainText('µg/m³')
  const before = await page.locator('.earth-readout-card').innerText()
  await page.getByRole('slider', { name: '时间轴', exact: true }).press('End')
  await expect(page.locator('.earth-data-card')).toContainText('14:00')
  await expect.poll(() => page.locator('.earth-readout-card').innerText()).not.toBe(before)
  await page.getByRole('button', { name: '取消固定点查' }).click()
  await page.mouse.move(5, 145)
  await page.screenshot({ path: 'test-results/earth-pm25.png' })
  await page.locator('.earth-mode-strip').getByRole('button', { name: '大气', exact: true }).click()
  await expect(page.locator('.earth-mode-strip .active')).toBeEnabled({ timeout: 60_000 })
  await expect(page.locator('.earth-data-card')).toContainText('GFS / 真实预报快照')
  await expect(page.locator('.earth-data-card')).toContainText('0.5° 全球网格')
  await page
    .locator('.earth-mode-strip')
    .getByRole('button', { name: '颗粒物 · PM2.5', exact: true })
    .click()
  await expect(page.locator('.earth-mode-strip .active')).toBeEnabled({ timeout: 60_000 })
  await expect(page.locator('.earth-data-card')).toContainText('CAMS / 真实颗粒物预报')
  const panel = await openControls(page)
  await panel.locator('.earth-grid-2 .el-select').first().click()
  await page.getByRole('option', { name: '无流线 · 仅浓度色层', exact: true }).click()
  await expect(page.locator('.earth-wind-trails')).toHaveCount(0)
  await expect(page.locator('.earth-data-card')).toContainText('µg/m³')
  await panel.locator('.earth-grid-2 .el-select').first().click()
  await page.getByRole('option', { name: '10 m 风 · GFS', exact: true }).click()
  await expect(page.locator('.earth-wind-trails')).toHaveCount(1)
  await page.locator('.earth-panel').getByText('平面', { exact: true }).click()
  await expect.poll(async () => (await readState(page)).mode).toBe('2D')
  await page.locator('.earth-panel').getByText('正交球面', { exact: true }).click()
  await expect.poll(orthographic).toBe(true)
  await page.getByRole('button', { name: '切换控制面板' }).click()
  await page.mouse.move(600, 320)
  await page.mouse.down()
  await page.mouse.move(650, 350, { steps: 12 })
  await page.mouse.up()
  await page.mouse.wheel(0, -200)
  await expect.poll(() => trailPixels(page), { timeout: 30_000 }).toBeGreaterThan(300)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.earth-mode-strip')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/earth-pm25-mobile.png' })
  await page.getByRole('button', { name: '退出地球模式', exact: true }).click()
  await expect(page.locator('.workbench')).toBeVisible()
  await expect.poll(orthographic).toBe(false)
  expect(errors).toEqual([])
})

test('真实 GFS 网格、轨迹、时间拖动、固定点查和卸载', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  await openMap(page)
  const primitives = await readPrimitiveCount(page)
  const imagery = await readImageryLayerCount(page)
  await page.locator('.header').getByRole('button', { name: '地球模式' }).click()
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 40_000 })
    .toContain('earth-plugin')
  await expect(page.locator('.earth-data-card')).toContainText('0.5° 全球网格', { timeout: 60_000 })
  await expect(page.locator('.earth-panel')).toBeHidden()
  await expect.poll(() => trailPixels(page), { timeout: 30_000 }).toBeGreaterThan(1000)
  const screen = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 125, lat: 20 })
  )
  expect(screen).toBeTruthy()
  await page.mouse.click(screen!.x, screen!.y)
  await expect(page.locator('.earth-readout-card')).toContainText('固定点查')
  await expect(page.locator('.earth-readout-card')).toContainText('m/s')
  await page.getByRole('slider', { name: '时间轴', exact: true }).press('End')
  await expect(page.locator('.earth-current-readout')).toContainText('14:00')
  await page.getByRole('button', { name: '上一预报时刻' }).click()
  await expect(page.locator('.earth-current-readout')).toContainText('11:00')
  await page.getByRole('button', { name: '播放时间' }).click()
  await expect.poll(async () => (await readState(page)).clock.running).toBe(true)
  await page.getByRole('button', { name: '暂停时间' }).click()
  await expect.poll(async () => (await readState(page)).clock.running).toBe(false)
  await page.getByRole('button', { name: '取消固定点查' }).click()
  await page.mouse.move(10, 140)
  await page.screenshot({ path: 'test-results/earth-real-desktop.png' })
  await page.getByRole('button', { name: '退出地球模式', exact: true }).click()
  await expect(page.locator('.workbench')).toBeVisible()
  await expect(page.locator('.earth-wind-trails')).toHaveCount(0)
  await expect.poll(() => readPrimitiveCount(page)).toBe(primitives)
  await expect.poll(() => readImageryLayerCount(page)).toBe(imagery)
  expect(errors).toEqual([])
})

test('平面投影仍有风场轨迹和点查，控制项可调整', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  await enterEarth(page)
  const panel = await openControls(page)
  await expect(panel).toContainText('721 × 361')
  await panel.getByText('平面', { exact: true }).click()
  await expect.poll(async () => (await readState(page)).mode).toBe('2D')
  await page.getByRole('button', { name: '切换控制面板' }).click()
  await expect.poll(() => trailPixels(page), { timeout: 30_000 }).toBeGreaterThan(1000)
  await page.mouse.click(500, 320)
  await expect(page.locator('.earth-readout-card')).toContainText('固定点查')
  await openControls(page)
  await panel.getByRole('slider', { name: '流线密度' }).press('End')
  await expect(panel.locator('.earth-control-field').first()).toContainText('256')
  await page.getByRole('button', { name: '切换控制面板' }).click()
  await page.screenshot({ path: 'test-results/earth-real-flat.png' })
  expect(errors).toEqual([])
})

test('可切换回合成样例，六种模式及退出保持可用', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await enterEarth(page)
  const panel = await useSamples(page)
  const cases = [
    ['大气', '温度'],
    ['海洋', '海面温度'],
    ['化学', '二氧化碳'],
    ['颗粒物', 'PM2.5'],
    ['空间天气', '极光概率'],
    ['生物', '珊瑚白化区域']
  ]
  for (const [mode, overlay] of cases) {
    await page.locator('.earth-mode-strip').getByRole('button', { name: mode, exact: true }).click()
    await expect(panel.locator('.earth-grid-2')).toContainText(overlay!)
  }
  await page.locator('.earth-hud-top').getByRole('button', { name: '退出地球模式' }).click()
  await expect(page.locator('.workbench')).toBeVisible()
  expect(errors).toEqual([])
})

test('窄屏可展开控制菜单并保留可见的时间和地图', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterEarth(page)
  await expect.poll(() => trailPixels(page), { timeout: 30_000 }).toBeGreaterThan(250)
  await page.getByRole('button', { name: 'earth +' }).click()
  await expect(page.locator('.earth-panel')).toBeVisible()
  await page.getByRole('button', { name: 'earth −' }).click()
  await expect(page.locator('.earth-panel')).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/earth-real-mobile.png' })
})

test('真实风场中的三个业务开关加载、定位、显隐和切换数据集', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await enterEarth(page)
  const panel = await openControls(page)
  await expect(panel).toContainText('合成业务样例')
  const overlays = [
    { key: 'points', label: '城市预报', prefix: 'weather-point:', count: 5 },
    { key: 'warnings', label: '气象预警', prefix: 'weather-warning:', count: 2 },
    { key: 'windFarm', label: '风电场', prefix: 'wind-farm:', count: 12 }
  ]
  for (const overlay of overlays) {
    const row = panel.locator(`[data-weather="${overlay.key}"]`)
    await row.locator('.el-switch').click()
    await expect(row).toContainText(`已加载 ${overlay.count} 个`)
    await expect
      .poll(() =>
        page.evaluate((prefix) => {
          const kit = window.__cesiumKit!
          const viewer = kit.getViewer() as unknown as {
            entities: { values: Array<{ id: string; show: boolean }> }
          }
          return viewer.entities.values.filter(
            (entity) => entity.id.startsWith(prefix) && entity.show
          ).length
        }, overlay.prefix)
      )
      .toBe(overlay.count)
  }
  await page.getByRole('slider', { name: '时间轴', exact: true }).press('End')
  await expect(page.locator('.earth-current-readout')).toContainText('14:00')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewer = window.__cesiumKit!.getViewer() as unknown as {
          entities: { values: Array<{ id: string; show: boolean }> }
        }
        return viewer.entities.values.filter(
          (entity) => entity.id.startsWith('weather-warning:') && entity.show
        ).length
      })
    )
    .toBe(2)
  await panel.getByRole('button', { name: '定位城市预报' }).click()
  await expect(panel).toBeHidden()
  await expect
    .poll(() =>
      page.evaluate(() => (window.__cesiumKit!.camera.getView() as { height: number }).height)
    )
    .toBeLessThan(4_000_000)
  const screen = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 114.3, lat: 30.6 })
  )
  await page.mouse.click(screen!.x, screen!.y)
  await expect(page.locator('.cesium-kit-popup').first()).toContainText('武汉')
  await page.screenshot({ path: 'test-results/earth-business-overlays.png' })
  await openControls(page)
  for (const overlay of overlays) {
    await panel.locator(`[data-weather="${overlay.key}"] .el-switch`).click()
    await expect
      .poll(() =>
        page.evaluate((prefix) => {
          const viewer = window.__cesiumKit!.getViewer() as unknown as {
            entities: { values: Array<{ id: string; show: boolean }> }
          }
          return viewer.entities.values.filter(
            (entity) => entity.id.startsWith(prefix) && entity.show
          ).length
        }, overlay.prefix)
      )
      .toBe(0)
  }
  await panel.locator('[data-weather="windFarm"] .el-switch').click()
  await expect(panel.locator('[data-weather="windFarm"]')).toContainText('已加载 12 个')
  await useSamples(page)
  await expect(panel.getByRole('switch', { name: '风电场', exact: true })).not.toBeChecked()
  await panel.locator('[data-weather="windFarm"] .el-switch').click()
  await expect(panel.locator('[data-weather="windFarm"]')).toContainText('已加载 12 个')
  expect(errors).toEqual([])
})

test('业务图层加载失败会复原开关且可重试', async ({ page }) => {
  await page.route('**/data/turbines.json', (route) =>
    route.fulfill({ status: 503, body: 'test unavailable' })
  )
  await enterEarth(page)
  const panel = await openControls(page)
  const row = panel.locator('[data-weather="windFarm"]')
  await row.locator('.el-switch').click()
  await expect(row).toContainText('加载失败，可重试')
  await expect(row.getByRole('switch')).not.toBeChecked()
  await page.unroute('**/data/turbines.json')
  await row.locator('.el-switch').click()
  await expect(row).toContainText('已加载 12 个')
  await expect(row.getByRole('switch')).toBeChecked()
})
