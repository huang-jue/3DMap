import { expect, test } from '@playwright/test'
import { openMap, readState, toggleSwitch } from './helpers'

test('GeoJSON 加载与移除', async ({ page }) => {
  await openMap(page)

  await toggleSwitch(page, '图层', 0)
  await expect
    .poll(async () => (await readState(page)).dataSources, { timeout: 15_000 })
    .toBe(1)

  await toggleSwitch(page, '图层', 0)
  await expect
    .poll(async () => (await readState(page)).dataSources, { timeout: 10_000 })
    .toBe(0)
})

test('本地 3D Tiles 样例加载与移除', async ({ page }) => {
  await openMap(page)

  await toggleSwitch(page, '图层', 1)
  await expect
    .poll(async () => (await readState(page)).tilesets, { timeout: 20_000 })
    .toBe(1)

  await toggleSwitch(page, '图层', 1)
  await expect
    .poll(async () => (await readState(page)).tilesets, { timeout: 10_000 })
    .toBe(0)
})
