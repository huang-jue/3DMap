import { expect, test } from '@playwright/test'
import { openMap, readDrawSessions } from './helpers'

test('绘制线并完成距离量算', async ({ page }) => {
  await openMap(page)

  const panel = page.locator('.cesium-panel', { hasText: '绘制与量算' }).first()
  await panel.getByRole('button', { name: '线', exact: true }).click()

  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  if (!box) return

  const first = { x: box.x + box.width * 0.22, y: box.y + box.height * 0.5 }
  const second = { x: box.x + box.width * 0.36, y: box.y + box.height * 0.5 }

  await page.mouse.click(first.x, first.y)
  await page.mouse.click(second.x, second.y)
  await page.mouse.click(second.x, second.y, { button: 'right' })

  await expect
    .poll(
      async () => {
        const sessions = await readDrawSessions(page)
        return sessions[0]?.state
      },
      { timeout: 10_000 }
    )
    .toBe('completed')

  const sessions = await readDrawSessions(page)
  expect(sessions[0]?.result?.measurement.distance).toBeGreaterThan(0)

  await panel.getByRole('button', { name: '清空绘制' }).click()
  await expect.poll(async () => (await readDrawSessions(page)).length).toBe(0)
})
