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
        entities: {
          list(): Array<{
            name: string
            polygon?: { extrudedHeight?: { getValue(t: unknown): number } }
          }>
        }
        getViewer(): { clock: { currentTime: unknown } }
      }
      const entity = kit.entities.list().find((item) => item.name === '水位面')
      return entity?.polygon?.extrudedHeight?.getValue(kit.getViewer().clock.currentTime) ?? 0
    })

  const before = await readHeight()
  await expect.poll(() => readHeight(), { timeout: 15_000 }).toBeGreaterThan(before)

  const first = await page.evaluate(() => {
    const kit = window.__cesiumKit as unknown as {
      clock: { state: { currentTime: Date } }
    }
    return kit.clock.state.currentTime.getTime()
  })
  await expect
    .poll(
      () =>
        page.evaluate((start) => {
          const kit = window.__cesiumKit as unknown as {
            clock: { state: { currentTime: Date } }
          }
          return kit.clock.state.currentTime.getTime() > start
        }, first),
      { timeout: 15_000 }
    )
    .toBe(true)
})
