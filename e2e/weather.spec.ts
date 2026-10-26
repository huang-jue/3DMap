import { expect, test } from '@playwright/test'
import { openMap, readImageryLayerCount, readState, toggleSwitch } from './helpers'

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
    .toBeGreaterThanOrEqual(before + 5)

  const panel = page.locator('.cesium-panel', { hasText: '天气预报' }).first()
  await expect(panel.locator('.frame')).not.toHaveText('-')
  await expect(panel.locator('.legend')).toBeVisible()

  await toggleSwitch(page, '天气预报', 2)
  await expect(panel.locator('.el-switch').nth(2)).toHaveClass(/is-checked/)

  await panel.getByRole('button', { name: '12h', exact: true }).click()
  await expect(panel.locator('.meta.mono', { hasText: '2026-07-01 12:00' })).toBeVisible()

  await toggleSwitch(page, '天气预报', 0)
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 15_000 })
    .not.toContain('weather-plugin')
  await expect.poll(() => readImageryLayerCount(page)).toBe(before)
  expect(errors).toEqual([])
})
