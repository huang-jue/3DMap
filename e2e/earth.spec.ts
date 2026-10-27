import { expect, test } from '@playwright/test'
import { openMap, readImageryLayerCount, readPrimitiveCount, readState } from './helpers'

test('地球模式切换、模式投影、点查与退出', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openMap(page)

  const primitives = await readPrimitiveCount(page)
  const imagery = await readImageryLayerCount(page)

  await page.locator('.header').getByRole('button', { name: '地球模式' }).click()
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 40_000 })
    .toContain('earth-plugin')

  const panel = page.locator('.earth-panel').first()
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('温度')
  await expect.poll(() => readPrimitiveCount(page), { timeout: 20_000 }).toBeGreaterThan(primitives)
  await expect.poll(() => readImageryLayerCount(page), { timeout: 20_000 }).toBeGreaterThan(imagery)

  await panel
    .locator('.earth-block', { hasText: '模式' })
    .locator('.el-radio-button', { hasText: '海洋' })
    .click()
  await expect(panel.locator('.earth-grid-2')).toContainText('洋流')

  await panel
    .locator('.earth-block', { hasText: '模式' })
    .locator('.el-radio-button', { hasText: '空间天气' })
    .click()
  await expect(panel.locator('.earth-grid-2')).toContainText('极光')

  await panel
    .locator('.earth-block', { hasText: '投影' })
    .locator('.el-radio-button', { hasText: '平面' })
    .click()
  await expect.poll(async () => (await readState(page)).mode, { timeout: 20_000 }).toBe('2D')

  await page.mouse.click(720, 360)
  await expect(panel.locator('.earth-probe')).toBeVisible()

  await page.locator('.header').getByRole('button', { name: '退出地球模式' }).click()
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 20_000 })
    .not.toContain('earth-plugin')
  await expect(page.locator('.workbench')).toBeVisible()
  await expect.poll(() => readPrimitiveCount(page)).toBe(primitives)
  await expect.poll(() => readImageryLayerCount(page)).toBe(imagery)
  expect(errors).toEqual([])
})

test('2D 投影后仍可切换地球模式', async ({ page }) => {
  await openMap(page)
  await page.locator('.header').getByRole('button', { name: '地球模式' }).click()
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 40_000 })
    .toContain('earth-plugin')
  const panel = page.locator('.earth-panel').first()
  await panel
    .locator('.earth-block', { hasText: '投影' })
    .locator('.el-radio-button', { hasText: '平面' })
    .click()
  await expect.poll(async () => (await readState(page)).mode, { timeout: 20_000 }).toBe('2D')
  await panel
    .locator('.earth-block', { hasText: '模式' })
    .locator('.el-radio-button', { hasText: '海洋' })
    .click()
  await expect(panel.locator('.earth-grid-2')).toContainText('洋流')
})

test('六种地球模式均可切换', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openMap(page)
  await page.locator('.header').getByRole('button', { name: '地球模式' }).click()
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 40_000 })
    .toContain('earth-plugin')
  const panel = page.locator('.earth-panel').first()
  const modeBlock = panel.locator('.earth-block', { hasText: '模式' })
  const cases = [
    ['大气', '温度'],
    ['海洋', '海面温度'],
    ['化学', '二氧化碳'],
    ['颗粒物', 'PM2.5'],
    ['空间天气', '极光概率'],
    ['生物', '珊瑚白化区域']
  ]
  for (const [mode, overlay] of cases) {
    await modeBlock.locator('.el-radio-button', { hasText: mode }).click()
    await expect(panel.locator('.earth-grid-2')).toContainText(overlay)
  }
  expect(errors).toEqual([])
})
