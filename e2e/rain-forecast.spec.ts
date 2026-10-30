import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { CesiumViewerManager } from '../packages/core/src/viewer/CesiumViewerManager'
import { openMap } from './helpers'

const ENDPOINT = '**/api.open-meteo.com/v1/forecast?**'
const FORECAST_NOW = Date.parse('2026-10-29T03:30:00Z')
test.beforeEach(async ({ page }) => {
  await page.addInitScript((now) => {
    const started = performance.now()
    Date.now = () => now + performance.now() - started
  }, FORECAST_NOW)
})
function forecast() {
  const start = Math.floor(FORECAST_NOW / 3600_000) * 3600
  return {
    hourly_units: {
      time: 'unixtime',
      rain: 'mm',
      showers: 'mm',
      precipitation: 'mm',
      precipitation_probability: '%',
      snowfall: 'cm'
    },
    hourly: {
      time: Array.from({ length: 73 }, (_, index) => start + index * 3600),
      rain: Array.from({ length: 73 }, (_, index) => (index === 2 ? null : index === 1 ? 2 : 0)),
      showers: Array(73).fill(0),
      precipitation: Array(73).fill(3),
      precipitation_probability: Array.from({ length: 73 }, (_, index) =>
        index === 2 ? null : index === 1 ? 80 : 0
      ),
      snowfall: Array(73).fill(0.2)
    }
  }
}
async function start(page: Page) {
  await openMap(page)
  if (page.viewportSize()!.width <= 720)
    await page.getByRole('button', { name: '展开工作台', exact: true }).click()
  await page.getByRole('button', { name: '地图选点降雨预报', exact: true }).click()
  await expect(page.getByRole('region', { name: '降雨预报', exact: true })).toBeVisible()
}
async function selectPoint(page: Page, x = 0.5) {
  const box = await page.locator('.cesium-viewer canvas').first().boundingBox()
  await page.mouse.click(box!.x + box!.width * x, box!.y + box!.height * 0.42)
}

for (const [width, height] of [
  [1440, 900],
  [1000, 700],
  [390, 844],
  [844, 390]
]) {
  test(`rain forecast layout ${width}x${height}`, async ({ page }) => {
    let requests = 0
    const requestedPoints: string[] = []
    await page.route(ENDPOINT, (route) => {
      requests++
      const url = new URL(route.request().url())
      requestedPoints.push(
        `${url.searchParams.get('longitude')},${url.searchParams.get('latitude')}`
      )
      return route.fulfill({ json: forecast() })
    })
    await page.setViewportSize({ width, height })
    await start(page)
    await page.mouse.move(width / 2, height / 3)
    expect(requests).toBe(0)
    await selectPoint(page)
    const panel = page.getByRole('region', { name: '降雨预报', exact: true })
    await expect(panel.locator('.rain-total')).toContainText('已知时段累计雨量：2.0 mm')
    await expect(panel.locator('.rain-chart')).toHaveCount(2)
    await expect(panel).toContainText('UTC+8')
    await expect(panel).toContainText('可用 48 / 48 个时段，雨量有效 47 个')
    expect(requests).toBe(1)
    await page.screenshot({ path: `test-results/rain-overview-${width}x${height}.png` })
    await panel.locator('summary').filter({ hasText: '逐小时明细' }).click()
    await expect(panel.locator('tbody tr')).toHaveCount(48)
    await expect(panel.locator('tbody tr').nth(1)).toContainText('缺测')
    await expect(panel.locator('tbody tr').first()).toContainText('0.2')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/rain-${width}x${height}.png` })
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(page.getByRole('button', { name: '展开工作台', exact: true })).toBeFocused()
    await selectPoint(page)
    expect(requests).toBe(1)
    await page.getByRole('button', { name: '展开工作台', exact: true }).click()
    await page.getByRole('button', { name: '地图选点降雨预报', exact: true }).click()
    // Terrain depth can settle between clicks; replay the same geographic point, not a screen pixel.
    await page.evaluate((coordinates) => {
      const pick = (window.__cesiumKit as unknown as CesiumViewerManager).pick
      const original = pick.pickAt.bind(pick)
      pick.pickAt = (screen) => {
        const value = original(screen)
        return value
          ? {
              ...value,
              lonLatHeight: { ...value.lonLatHeight, lon: coordinates[0]!, lat: coordinates[1]! }
            }
          : value
      }
      ;(window as unknown as { restoreRainPick: () => void }).restoreRainPick = () => { pick.pickAt = original }
    }, requestedPoints[0]!.split(',').map(Number))
    await selectPoint(page)
    await page.evaluate(() => (window as unknown as { restoreRainPick: () => void }).restoreRainPick())
    await expect(panel.locator('.rain-total')).toContainText('2.0 mm')
    expect(requests, requestedPoints.join(' → ')).toBe(1)
    await panel.getByRole('button', { name: '关闭降雨预报', exact: true }).click()
    await expect(panel).toHaveCount(0)
  })
}

test('forecast errors, retry, explicit offline demo and scene restoration', async ({ page }) => {
  let requests = 0
  let fail = true
  await page.route(ENDPOINT, (route) => {
    requests++
    return route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : forecast() })
  })
  await start(page)
  await selectPoint(page)
  const panel = page.getByRole('region', { name: '降雨预报', exact: true })
  await expect(panel.getByRole('alert')).toContainText('503')
  expect(await panel.getByRole('combobox').inputValue()).toBe('online')
  fail = false
  await panel.getByRole('button', { name: '重试预报', exact: true }).click()
  await expect(panel.locator('.rain-total')).toBeVisible()
  await panel.getByRole('button', { name: '刷新预报', exact: true }).click()
  await expect(panel.locator('.rain-total')).toBeVisible()
  expect(requests).toBe(3)
  await panel.getByRole('combobox').selectOption('demo')
  await expect(panel).toContainText('离线演示 · 固定样例曲线')
  await expect(panel.locator('.rain-total')).toBeVisible()
  expect(requests).toBe(3)
  const scene = await page.evaluate(() => {
    const manager = window.__cesiumKit as unknown as CesiumViewerManager
    return manager.snapshots.capture().snapshot
  })
  expect(scene.extensions!['rain-forecast']).toMatchObject({ mode: 'demo', open: true })
  expect(Object.keys(scene.extensions!['rain-forecast'] as object).sort()).toEqual([
    'mode',
    'open',
    'point'
  ])
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__cesiumKit))
  const report = await page.evaluate(async (snapshot) => {
    const manager = window.__cesiumKit as unknown as CesiumViewerManager
    return manager.snapshots.restore(snapshot)
  }, scene)
  expect(report.failed).toEqual([])
  await expect(panel).toContainText('离线演示 · 固定样例曲线')
  await expect(panel.locator('.rain-total')).toBeVisible()
  await panel.getByRole('combobox').selectOption('online')
  await expect(panel.locator('.rain-total')).toBeVisible()
  const online = await page.evaluate(
    () => (window.__cesiumKit as unknown as CesiumViewerManager).snapshots.capture().snapshot
  )
  const previousRequests = requests
  await page.evaluate(async (snapshot) => {
    await (window.__cesiumKit as unknown as CesiumViewerManager).snapshots.restore(snapshot)
  }, online)
  await expect(panel.locator('.rain-total')).toBeVisible()
  expect(requests).toBe(previousRequests + 1)
})

test('late requests cannot update another point or a closed forecast', async ({ page }) => {
  const held: Array<() => Promise<void>> = []
  await page.route(ENDPOINT, (route) => {
    const json = forecast()
    const index = held.length
    json.hourly.rain = Array(73).fill(index === 0 ? 9 : 1)
    held.push(async () => {
      await route.fulfill({ json }).catch(() => undefined)
    })
  })
  await start(page)
  await selectPoint(page, 0.45)
  await expect.poll(() => held.length).toBe(1)
  await selectPoint(page, 0.55)
  await expect.poll(() => held.length).toBe(2)
  await held[1]!()
  const panel = page.getByRole('region', { name: '降雨预报', exact: true })
  await expect(panel.locator('.rain-total')).toContainText('48.0 mm')
  await held[0]!()
  await expect(panel.locator('.rain-total')).toContainText('48.0 mm')
  await panel.getByRole('button', { name: '刷新预报', exact: true }).click()
  await expect.poll(() => held.length).toBe(3)
  await page.keyboard.press('Escape')
  await held[2]!()
  await expect(panel).toHaveCount(0)
})

for (const [width, height] of [
  [1000, 700],
  [390, 844],
  [844, 390]
]) {
  test(`Earth forecast ${width}x${height} preserves map time and switches back to analysis`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height })
    const sample = await readFile('apps/playground/public/data/earth/manifest.json', 'utf8')
    await page.route('**/data/earth/real/manifest.json', (route) =>
      route.fulfill({ body: sample, contentType: 'application/json' })
    )
    let requests = 0
    await page.route(ENDPOINT, (route) => {
      requests++
      return route.fulfill({ json: forecast() })
    })
    await page.goto('/?earth=air')
    await expect(page.locator('.earth-global-status')).toHaveCount(0, { timeout: 100_000 })
    await expect(page.locator('.earth-mode-strip')).toBeVisible({ timeout: 100_000 })
    await page.keyboard.press('Escape')
    await selectPoint(page)
    if (width <= 720)
      await page
        .locator('.earth-mobile-tabs')
        .getByRole('button', { name: '点查', exact: true })
        .click()
    await expect(page.locator('.earth-readout-card')).toBeVisible()
    expect(requests).toBe(0)
    const before = await page.evaluate(() => {
      const manager = window.__cesiumKit as unknown as CesiumViewerManager
      return {
        time: manager.clock.state.currentTime.toISOString(),
        layers: manager.viewer.imageryLayers.length
      }
    })
    await page
      .locator('.earth-readout-card')
      .getByRole('button', { name: '降雨预报', exact: true })
      .click()
    const panel = page.getByRole('region', { name: '降雨预报', exact: true })
    await expect(panel.locator('.rain-total')).toBeVisible()
    const after = await page.evaluate(() => {
      const manager = window.__cesiumKit as unknown as CesiumViewerManager
      return {
        time: manager.clock.state.currentTime.toISOString(),
        layers: manager.viewer.imageryLayers.length
      }
    })
    expect(after).toEqual(before)
    expect(requests).toBe(1)
    await expect(page.getByRole('slider', { name: '时间轴', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/rain-earth-${width}x${height}.png` })
    await panel.getByRole('button', { name: '变量分析', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(page.locator('.earth-analysis-panel')).toBeVisible()
  })
}
