import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page) {
  await expect(page.locator('.earth-catalog')).toBeVisible({ timeout: 100_000 })
  await expect(page.locator('.earth-mode-strip .active')).toBeEnabled({ timeout: 80_000 })
}

async function mode(page: Page, label: string) {
  await page
    .getByRole('group', { name: '数据模式', exact: true })
    .getByRole('button', { name: label, exact: true })
    .click()
  await ready(page)
}

async function overlay(page: Page, label: string) {
  await page
    .getByRole('group', { name: '叠加图层', exact: true })
    .getByRole('button', { name: label, exact: true })
    .click()
  await ready(page)
  await expect(page.locator('.earth-data-card strong')).toContainText(label)
}

test('参考 CO2 深链接可加载真实化学场，四种化学层可切换和点查', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message))
  await page.goto('/#current/chem/surface/level/overlay=co2sc/orthographic')
  await ready(page)
  await expect(page.locator('.earth-data-card')).toContainText('GEOS-5')
  await expect(page.locator('.earth-data-card')).toContainText('ppmv')
  await expect(page.locator('.earth-current-readout')).toContainText('03:30')
  await expect(page.locator('.earth-data-card')).toContainText('0.3125° × 0.25°')
  await expect(
    page.getByRole('group', { name: '数据模式', exact: true }).getByRole('button')
  ).toHaveCount(6)
  const coords = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 135, lat: 40 })
  )
  await page.mouse.click(coords!.x, coords!.y)
  await expect(page.locator('.earth-readout-card')).toContainText('ppmv')
  await page.getByRole('button', { name: '取消固定点查' }).click()
  await page.mouse.move(5, 140)
  await page.screenshot({ path: 'test-results/earth-chemistry.png' })
  for (const label of [
    'CO · 地表一氧化碳',
    'SO₂ · 地表二氧化硫',
    'NO₂ · 二氧化氮',
    'CO₂ · 地表二氧化碳'
  ]) {
    await overlay(page, label)
  }
  await expect(page).toHaveURL(/overlay=co2sc/)
  await page
    .getByRole('group', { name: '叠加图层', exact: true })
    .getByRole('button', { name: '无叠加层', exact: true })
    .click()
  await ready(page)
  await expect(page.locator('.earth-data-card')).toContainText('无叠加层')
  await overlay(page, 'CO₂ · 地表二氧化碳')
  const url = page.url()
  await page.reload()
  await ready(page)
  await expect(page.locator('.earth-data-card')).toContainText('ppmv')
  expect(page.url()).toBe(url)
  expect(errors).toEqual([])
})

test('底部颗粒物六层与大气八个高度可切换', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message))
  await page.goto('/?earth=pm25')
  await ready(page)
  for (const label of ['尘埃消光', 'PM1', 'PM10', '有机物气溶胶', '硫酸盐消光', 'PM2.5'])
    await overlay(page, label)
  await mode(page, '大气')
  await expect(
    page.getByRole('group', { name: '大气高度', exact: true }).getByRole('button')
  ).toHaveCount(8)
  await page
    .getByRole('group', { name: '大气高度', exact: true })
    .getByRole('button', { name: '850 hPa', exact: true })
    .click()
  await ready(page)
  await expect(page.locator('.earth-data-card')).toContainText('850hPa')
  await overlay(page, '温度')
  await expect(page.locator('.earth-data-card')).toContainText('°C')
  await overlay(page, '相对湿度')
  await overlay(page, '风电功率密度')
  await expect(page.locator('.earth-data-card')).toContainText('W/m²')
  await page
    .getByRole('group', { name: '大气高度', exact: true })
    .getByRole('button', { name: '近地面', exact: true })
    .click()
  await ready(page)
  await overlay(page, '温度')
  await overlay(page, '紫外线指数')
  expect(errors).toEqual([])
})

test('海洋海流波浪、极光、生物和窄屏切换', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message))
  await page.goto('/#current/ocean/surface/level/overlay=uvo-1d_m/orthographic')
  await ready(page)
  await expect(page.locator('.earth-data-card')).toContainText('CMEMS')
  await expect(page.locator('.earth-wind-trails')).toBeVisible()
  await overlay(page, '海面温度')
  await overlay(page, '海温异常')
  await overlay(page, '有效浪高')
  await page
    .getByRole('group', { name: '动画类型', exact: true })
    .getByRole('button', { name: '波浪 · 波向与周期', exact: true })
    .click()
  await ready(page)
  await overlay(page, '波峰周期')
  await expect(page.locator('.earth-wind-trails')).toHaveCount(1)
  await expect(page.locator('.el-message--warning')).toHaveCount(0)
  await expect(page.locator('.earth-data-card strong')).toContainText('s')
  await mode(page, '空间天气')
  await expect(page.locator('.earth-wind-trails')).toHaveCount(0)
  await expect(page.locator('.earth-data-card')).toContainText('可见极光概率')
  await expect(page.locator('.el-message--warning')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/earth-aurora.png' })
  await mode(page, '生物')
  await expect(page.locator('.earth-data-card')).toContainText('热压力等级')
  await expect(page.locator('.earth-data-card')).toContainText('Coral Reef Watch')
  await expect(page.locator('.el-message--warning')).toHaveCount(0)
  await page.getByRole('group', { name: '生物注释', exact: true }).getByRole('button').click()
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const viewer = window.__cesiumKit!.getViewer() as unknown as {
            entities: { values: Array<{ id: string; show: boolean }> }
          }
          return viewer.entities.values.filter(
            (entity) => entity.id.startsWith('earth-annotation:firms-') && entity.show
          ).length
        }),
      { timeout: 30_000 }
    )
    .toBe(2000)
  await page.getByRole('group', { name: '生物注释', exact: true }).getByRole('button').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.earth-catalog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/earth-catalog-mobile.png' })
  await mode(page, '大气化学')
  await expect(page.locator('.earth-catalog')).toContainText('CO₂')
  expect(errors).toEqual([])
})
