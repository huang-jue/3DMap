import { expect, type Page } from '@playwright/test'

export interface KitState {
  entities: number
  features: string[]
  imagery: string[]
  activeImagery: string | null
  mode: string
  clock: { running: boolean; multiplier: number }
  dataSources: number
  tilesets: number
}

export interface E2eLayerNode {
  id: string
  name: string
  kind: string
  visible: boolean
  effectiveVisible: boolean
  entityCount?: number
  children: E2eLayerNode[]
}

export interface E2eDrawSession {
  id: string
  state: string
  result: {
    measurement: {
      distance?: number
      area?: number
      heightDiff?: number
    }
  } | null
}

declare global {
  interface Window {
    __cesiumKit?: {
      entities: { count: number }
      features: { names(): string[] }
      imagery: {
        list(): Array<{ id: string }>
        active: string | null
        switchTo(id: string | null): void
      }
      scene: { getMode(): string; setMode(mode: string, duration?: number): void }
      camera: {
        getView(): unknown
        setView(target: { lon: number; lat: number; height: number }): void
      }
      clock: { state: { running: boolean; multiplier: number }; setMultiplier(n: number): void }
      dataSources: { list(): unknown[] }
      tilesets: { list(): unknown[] }
      coords: {
        pickPosition(): { source: string } | undefined
        toScreen(input: { lon: number; lat: number; height?: number }): { x: number; y: number } | undefined
      }
      draw: { sessionList: E2eDrawSession[] }
      layerManager: { tree(): E2eLayerNode[] }
      popup: { size: number }
      getViewer(): {
        scene: { primitives: { length: number } }
        imageryLayers: { length: number }
      } | null
    }
  }
}

export async function openMap(page: Page): Promise<void> {
  // 软件渲染 + Vite 冷启动偶发失败，重载一次即可恢复
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/')
    try {
      await page.waitForFunction(() => Boolean(window.__cesiumKit), undefined, {
        timeout: 100_000
      })
      await expect(page.locator('canvas')).toBeVisible()
      return
    } catch (error) {
      if (attempt === 1) throw error
      await page.waitForTimeout(1500)
    }
  }
}

export async function readState(page: Page): Promise<KitState> {
  return page.evaluate(() => {
    const kit = window.__cesiumKit!
    return {
      entities: kit.entities.count,
      features: kit.features.names(),
      imagery: kit.imagery.list().map((item) => item.id),
      activeImagery: kit.imagery.active,
      mode: kit.scene.getMode(),
      clock: { running: kit.clock.state.running, multiplier: kit.clock.state.multiplier },
      dataSources: kit.dataSources.list().length,
      tilesets: kit.tilesets.list().length
    }
  })
}

export async function readLayerTree(page: Page): Promise<E2eLayerNode[]> {
  return page.evaluate(() => window.__cesiumKit!.layerManager.tree())
}

export async function readDrawSessions(page: Page): Promise<E2eDrawSession[]> {
  return page.evaluate(() => window.__cesiumKit!.draw.sessionList)
}

export async function readPrimitiveCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__cesiumKit?.getViewer()?.scene.primitives.length ?? 0)
}

export async function readImageryLayerCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__cesiumKit?.getViewer()?.imageryLayers.length ?? 0)
}

export async function toggleSwitch(page: Page, panelTitle: string, index = 0): Promise<void> {
  const card = page.locator('.cesium-panel', { hasText: panelTitle }).first()
  const control = card.locator('.el-switch').nth(index)
  // 面板可滚动，Element Plus 的 input 被隐藏，直接触发根节点点击更稳
  await control.evaluate((element) => (element as HTMLElement).click())
}
