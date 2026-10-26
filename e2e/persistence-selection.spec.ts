import { expect, test } from '@playwright/test'
import type { CesiumViewerManager } from '../packages/core/src/viewer/CesiumViewerManager'
import { openMap } from './helpers'

const drawings = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '保存测试点' },
      geometry: { type: 'Point', coordinates: [113.5, 30.5, 30] }
    }
  ]
}

test('imports/exports drawings and restores a saved scene after page reload', async ({ page }) => {
  await openMap(page)
  const panel = page.locator('.persistence-panel')
  await panel
    .getByLabel('导入绘制文件')
    .setInputFiles({
      name: 'points.geojson',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(drawings))
    })
  await expect(panel.getByRole('status')).toContainText('已导入 1 个成果')
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出成果', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('drawings.geojson')
  await page.evaluate(async () => {
    const kit = window.__cesiumKit as unknown as CesiumViewerManager
    kit.camera.setView({ lon: 113.5, lat: 30.5, height: 10000 })
    const group = kit.layerManager.createGroup('保存分组', { id: 'saved-group', alpha: 0.6 })
    await kit.layerManager.addDataSource(
      'saved-geo',
      { type: 'geojson', data: '/data/demo.geojson' },
      { parentId: group.id, visible: false }
    )
    kit.clock.setMultiplier(20)
  })
  await panel.getByRole('button', { name: '保存到本地', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('场景已保存')
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__cesiumKit))
  await panel.getByRole('button', { name: '恢复本地场景', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('失败 0')
  const restored = await page.evaluate(() => {
    const kit = window.__cesiumKit as unknown as CesiumViewerManager
    return {
      count: kit.draw.sessionList.length,
      tree: kit.layerManager.tree(),
      view: kit.camera.getView(),
      clock: kit.clock.state
    }
  })
  expect(restored.count).toBe(1)
  expect(restored.tree.find((node) => node.id === 'saved-group')?.children[0]?.visible).toBe(false)
  expect(restored.view.lon).toBeCloseTo(113.5, 3)
  expect(restored.clock.running).toBe(false)
  expect(restored.clock.multiplier).toBe(20)
})

test('picks a local 3D Tiles building, shows attributes and clears on layer removal', async ({
  page
}) => {
  await openMap(page)
  await page.evaluate(async () => {
    const kit = window.__cesiumKit as unknown as CesiumViewerManager
    await kit.layerManager.addTileset('selection-building', '/tiles/selection/tileset.json', {
      id: 'selection-layer'
    })
    kit.camera.setView({ lon: 113.5, lat: 30.5, height: 1600 }, { pitch: -90 })
  })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const kit = window.__cesiumKit as unknown as CesiumViewerManager
          return kit.pick.pickAt()?.kind
        }),
      { timeout: 30000 }
    )
    .toBe('tiles-feature')
  const box = await page.locator('canvas').first().boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.locator('.selection-panel')).toContainText('building-001')
  await expect(page.locator('.selection-panel')).toContainText('示例建筑')
  expect(
    await page.evaluate(() => {
      const kit = window.__cesiumKit as unknown as CesiumViewerManager
      return kit.selection.state.selected?.feature?.color.toCssHexString()
    })
  ).toBe('#ffff00')
  await page.evaluate(() =>
    (window.__cesiumKit as unknown as CesiumViewerManager).layerManager.remove('selection-layer')
  )
  await expect(page.locator('.selection-panel')).toContainText('点击实体或模型查看属性')
})
