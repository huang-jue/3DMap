import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function openEarth(page: Page) {
  const sample = await readFile('apps/playground/public/data/earth/manifest.json', 'utf8')
  await page.route('**/data/earth/real/manifest.json', (route) =>
    route.fulfill({ body: sample, contentType: 'application/json' })
  )
  await page.goto('/?earth=air')
  await expect(page.locator('.earth-mode-strip')).toBeVisible({ timeout: 100_000 })
  await expect(page.locator('.earth-global-status')).toHaveCount(0, { timeout: 60_000 })
}
async function settings(page: Page) {
  if (!(await page.locator('.earth-sidebar-tabs').isVisible()))
    await page.getByRole('button', { name: '切换控制面板', exact: true }).click()
  await page
    .locator('.earth-sidebar-tabs')
    .getByRole('button', { name: '设置', exact: true })
    .click()
  await expect(page.locator('.earth-panel')).toBeVisible()
}
for (const [width, height] of [
  [1440, 900],
  [1000, 700],
  [390, 844],
  [844, 390]
]) {
  test(`UI smoke ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.locator('.workbench')).toBeVisible({ timeout: 100_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    if (width <= 720) await page.getByRole('button', { name: '展开工作台' }).click()
    const camera = page.locator('.camera-readout')
    await camera.scrollIntoViewIfNeeded()
    await expect(camera).toBeVisible()
    await expect(camera.locator('.camera-readout-row')).toHaveCount(4)
    expect(await camera.evaluate((element) => {
      const row = element.querySelector('.camera-readout-row')!
      return [
        getComputedStyle(row.querySelector('dt')!).backgroundColor,
        getComputedStyle(row.querySelector('dd')!).backgroundColor
      ]
    })).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
    await camera.screenshot({ path: 'test-results/camera-ui-' + width + 'x' + height + '.png' })
    await page.locator('summary').filter({ hasText: '成果与场景' }).click()
    await expect(page.getByRole('button', { name: '导出场景', exact: true })).toBeVisible()
    await page.screenshot({ path: `test-results/workbench-${width}x${height}.png` })
    await openEarth(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    if (width <= 720) {
      await page
        .locator('.earth-mobile-tabs')
        .getByRole('button', { name: '数据', exact: true })
        .click()
      await expect(page.locator('.earth-data-card')).toBeVisible()
      await page
        .locator('.earth-mobile-tabs')
        .getByRole('button', { name: '图层', exact: true })
        .click()
      await expect(page.locator('.earth-data-card')).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(page.locator('.earth-catalog')).toBeHidden()
    }
    const time = page.locator('.earth-current-readout')
    expect(await time.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await settings(page)
    await page.getByRole('combobox', { name: '数据集', exact: true }).press('Enter')
    await expect(page.getByRole('option', { name: '合成样例 · 六种模式' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `test-results/earth-ui-${width}x${height}.png` })
  })
}

test('analysis, scene extensions, split/curtain and cleanup', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  const invalidOptions: string[] = []
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Invalid prop'))
      invalidOptions.push(message.text())
  })
  await openEarth(page)
  await expect.poll(() => workers.length).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  const position = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 120, lat: 22 })
  )
  expect(position).toBeTruthy()
  await page.mouse.click(position!.x, position!.y)
  await expect(page.locator('.earth-readout-card')).toBeVisible()
  await page.getByRole('button', { name: '查看时间曲线' }).click()
  await expect(page.locator('.series-chart')).toHaveCount(3)
  await expect(page.getByRole('button', { name: '导出 CSV' })).toBeEnabled()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 CSV' }).click()
  expect((await download).suggestedFilename()).toBe('point-series.csv')
  await settings(page)
  await page.getByRole('button', { name: '开启地图对比' }).click()
  await expect(page.locator('.comparison-viewer .cesium-viewer')).toHaveCount(1)
  await expect(page.getByRole('combobox', { name: 'B 模式' })).toBeEnabled({ timeout: 60_000 })
  await page.getByRole('combobox', { name: 'B 标量' }).press('Enter')
  await page.getByRole('option', { name: '无标量' }).click()
  await expect(page.locator('.compare-label-b')).toContainText('仅矢量')
  await page.getByRole('combobox', { name: '对比方式' }).press('Enter')
  await page.getByRole('option', { name: '卷帘对比' }).click()
  await expect(page.getByRole('slider', { name: '卷帘分割位置' })).toBeVisible()
  await page.screenshot({ path: 'test-results/earth-curtain.png' })
  await page.getByRole('slider', { name: '卷帘分割位置' }).press('ArrowRight')
  const sceneDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出场景', exact: true }).click()
  const sceneFile = await sceneDownload
  const path = await sceneFile.path()
  const scene = JSON.parse(await readFile(path!, 'utf8'))
  expect(scene.extensions['earth-workspace'].comparison.mode).toBe('curtain')
  expect(scene.extensions['earth-workspace'].point).toBeTruthy()
  await page.getByRole('button', { name: '退出对比' }).click()
  await expect(page.locator('.comparison-viewer')).toHaveCount(0)
  await page.locator('input[aria-label="导入地球场景"]').setInputFiles({
    name: 'scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene))
  })
  await expect(page.locator('.comparison-viewer .cesium-viewer')).toHaveCount(1)
  await expect(page.getByRole('slider', { name: '卷帘分割位置' })).toBeVisible()
  await page.getByRole('button', { name: '退出对比' }).click()
  await page.getByRole('button', { name: '退出地球模式', exact: true }).first().click()
  await expect(page.locator('.comparison-viewer')).toHaveCount(0)
  await expect(page.locator('.cesium-viewer')).toHaveCount(1)
  expect(errors).toEqual([])
  expect(invalidOptions).toEqual([])
})
