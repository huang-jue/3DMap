import { expect, test } from '@playwright/test'
import { openMap, readState, toggleSwitch } from './helpers'

test('ClockService 驱动水位演进插件', async ({ page }) => {
  await openMap(page)

  await toggleSwitch(page, '时间轴', 0)
  await expect
    .poll(async () => (await readState(page)).features, { timeout: 15_000 })
    .toContain('demo-water-level')

  const state = await readState(page)
  expect(state.clock.running).toBe(true)
  expect(state.clock.multiplier).toBe(21600)

  const readHeight = () =>
    page.evaluate(() => {
      const kit = window.__cesiumKit as unknown as {
        entities: { list(): Array<{ name: string; polygon?: { extrudedHeight?: { getValue(t: unknown): number } } }> }
        getViewer(): { clock: { currentTime: unknown } }
      }
      const entity = kit.entities.list().find((item) => item.name === '水位面')
      return entity?.polygon?.extrudedHeight?.getValue(kit.getViewer().clock.currentTime) ?? 0
    })

  const before = await readHeight()
  await page.waitForTimeout(2000)
  const after = await readHeight()

  expect(after).toBeGreaterThan(before)

  const timeAdvanced = await page.evaluate(async () => {
    const kit = window.__cesiumKit as unknown as {
      clock: { state: { currentTime: Date } }
    }
    const first = kit.clock.state.currentTime.getTime()
    await new Promise((resolve) => setTimeout(resolve, 500))
    return kit.clock.state.currentTime.getTime() > first
  })
  expect(timeAdvanced).toBe(true)
})
