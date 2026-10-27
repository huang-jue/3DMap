import { expect, test } from '@playwright/test'
import { openMap, readState } from './helpers'

test('水旱灾害防御四预插件加载与交互', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openMap(page)

  const before = await readState(page)
  const panel = page.locator('.flood-panel').first()
  await panel
    .locator('.el-switch')
    .first()
    .evaluate((element) => (element as HTMLElement).click())
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 30_000 })
    .toContain('flood-plugin')
  await expect
    .poll(async () => (await readState(page)).entities, { timeout: 20_000 })
    .toBeGreaterThan(before.entities)

  await expect(panel.locator('.counts')).toBeVisible()

  await panel.getByRole('tab', { name: '预报' }).click()
  await expect(panel.getByRole('tabpanel', { name: '预报' }).locator('canvas')).toBeVisible()
  await expect(panel.locator('.value')).not.toHaveText('-')

  await panel.getByRole('tab', { name: '预警' }).click()
  await expect(panel.locator('.warning-item').first()).toBeVisible()
  await panel.locator('.warning-item').first().click()
  await expect(panel.locator('.warning-detail')).toBeVisible()

  await panel.getByRole('tab', { name: '预演' }).click()
  const scenarioSelect = panel
    .locator('.el-tab-pane', { hasText: '预演场景' })
    .locator('.el-select')
    .first()
  await scenarioSelect.click()
  await page.getByRole('option', { name: '流域水库群联合调度' }).click()
  await expect(
    panel.getByRole('tabpanel', { name: '预演' }).locator('.chart.small canvas')
  ).toBeVisible()

  await panel.getByRole('tab', { name: '预案' }).click()
  await expect(panel.locator('.knowledge-item').first()).toBeVisible()
  await panel.getByRole('button', { name: '生成预案' }).click()
  await expect(panel.locator('.plan-result')).toBeVisible()

  await panel
    .locator('.el-switch')
    .first()
    .evaluate((element) => (element as HTMLElement).click())
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 20_000 })
    .not.toContain('flood-plugin')
  expect(errors).toEqual([])
})
