import { expect, test } from '@playwright/test'
import { openMap, readLayerTree, readState, toggleSwitch } from './helpers'




test('图层树展示、级联显隐与删除', async ({ page }) => {
  await openMap(page)
  await toggleSwitch(page, '图层', 0)
  await expect
    .poll(async () => (await readState(page)).dataSources, { timeout: 15_000 })
    .toBe(1)

  const tree = await readLayerTree(page)
  const group = tree.find((node) => node.name === '示例图层')
  expect(group).toBeTruthy()
  expect(group?.children.some((node) => node.id === 'demo-geojson')).toBe(true)

  const card = page
    .locator('.cesium-panel')
    .filter({ has: page.locator('.panel-title').getByText('图层树', { exact: true }) })
    .first()
  const groupNode = card.getByRole('treeitem', { name: /示例图层/ }).first()
  await groupNode.locator('input').first().evaluate((element) => {
    ;(element as HTMLElement).click()
  })

  await expect
    .poll(async () => {
      const nodes = await readLayerTree(page)
      return nodes.find((node) => node.name === '示例图层')?.effectiveVisible
    })
    .toBe(false)

  await groupNode.locator('input').first().evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await expect
    .poll(async () => {
      const nodes = await readLayerTree(page)
      return nodes.find((node) => node.name === '示例图层')?.effectiveVisible
    })
    .toBe(true)

  const childNode = card.getByRole('treeitem', { name: /demo-geojson/ }).first()
  await childNode.locator('button[title="删除"]').first().click()
  await expect
    .poll(async () => (await readState(page)).dataSources, { timeout: 10_000 })
    .toBe(0)
})
