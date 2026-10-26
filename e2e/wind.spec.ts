import { expect, test } from '@playwright/test'
import { openMap, readPrimitiveCount, readState, toggleSwitch } from './helpers'

test('气象风场启停后图元回到基线', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openMap(page)
  const before = await readPrimitiveCount(page)

  await toggleSwitch(page, '风场', 0)
  await expect.poll(async () => (await readState(page)).features).toContain('wind-field')
  await expect.poll(() => readPrimitiveCount(page)).toBeGreaterThan(before)

  const sampleField = async () => {
    const screenshot = await page.screenshot({ clip: { x: 50, y: 100, width: 500, height: 400 } })
    return page.evaluate(async (base64) => {
      const source = new Image()
      source.src = `data:image/png;base64,${base64}`
      await source.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 500
      canvas.height = 400
      const context = canvas.getContext('2d')!
      context.drawImage(source, 0, 0)
      const { data } = context.getImageData(0, 0, 500, 400)
      let white = 0
      let hash = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 210 && data[i + 1]! > 210 && data[i + 2]! > 210) white += 1
        hash = (hash * 31 + data[i]! + data[i + 1]! + data[i + 2]!) | 0
      }
      return { white, hash }
    }, screenshot.toString('base64'))
  }
  // Assert visible white streamlines and actual frame changes, not just mounted primitives.
  await expect.poll(async () => (await sampleField()).white).toBeGreaterThan(20)
  const first = await sampleField()
  await expect.poll(async () => (await sampleField()).hash).not.toBe(first.hash)
  await page.screenshot({ path: 'test-results/wind-field.png' })
  expect(errors).toEqual([])

  await toggleSwitch(page, '风场', 0)
  await expect.poll(async () => (await readState(page)).features).not.toContain('wind-field')
  await expect.poll(() => readPrimitiveCount(page)).toBe(before)
})

test('风电场启停后实体回到基线', async ({ page }) => {
  await openMap(page)
  const before = (await readState(page)).entities

  await toggleSwitch(page, '风场', 1)
  await expect.poll(async () => (await readState(page)).features).toContain('wind-farm')
  await expect.poll(async () => (await readState(page)).entities).toBeGreaterThan(before)

  await page.evaluate(() =>
    window.__cesiumKit!.camera.setView({ lon: 110, lat: 30, height: 200000 })
  )
  await page.waitForTimeout(1000)
  const turbine = await page.evaluate(() =>
    window.__cesiumKit!.coords.toScreen({ lon: 110, lat: 30, height: 90 })
  )
  expect(turbine).toBeTruthy()
  const canvas = await page.locator('canvas').boundingBox()
  expect(canvas).toBeTruthy()
  await page.mouse.click(canvas!.x + turbine!.x, canvas!.y + turbine!.y)
  await expect(page.locator('.selected-title')).toHaveText('风机 01')

  await toggleSwitch(page, '风场', 1)
  await expect.poll(async () => (await readState(page)).features).not.toContain('wind-farm')
  await expect.poll(async () => (await readState(page)).entities).toBe(before)
})
