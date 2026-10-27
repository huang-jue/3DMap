import * as Cesium from 'cesium'
import type { CesiumFeature, FeatureContext, PopupHandle } from '@sgyx/cesium-kit-core'
import { loadFloodDataset } from '../data/loadFloodData'
import { ensureFloodLayerGroup } from '../shared/layerTree'
import { toCesiumColor } from '../shared/color'
import {
  PROJECT_TYPE_COLORS,
  PROJECT_TYPE_TEXT,
  STATION_TYPE_COLORS,
  STATION_TYPE_TEXT
} from '../shared/palettes'
import type { FloodDataset, HydrologyStation, River, WaterProject } from '../shared/types'

export interface HydroDataFeatureOptions {
  data: FloodDataset | string
  name?: string
  visible?: boolean
  digitalMirrorUrl?: string
  onSelect?: (payload: River | WaterProject | HydrologyStation | null) => void
}

export interface HydroDataFeature extends CesiumFeature<HydroDataFeatureOptions> {
  readonly data: FloodDataset | null
  setRiversVisible(visible: boolean): void
  setProjectsVisible(visible: boolean): void
  setStationsVisible(visible: boolean): void
  setDigitalMirrorVisible(visible: boolean): void
  setVisible(visible: boolean): void
  flyToDigitalMirror(duration?: number): void
  flyToBounds(duration?: number): void
}

type Selectable = River | WaterProject | HydrologyStation

function isProject(item: Selectable): item is WaterProject {
  return 'type' in item && 'lon' in item
}

function isStation(item: Selectable): item is HydrologyStation {
  return 'type' in item && 'lon' in item && 'readings' in item
}

function riverPositions(river: River): Cesium.Cartesian3[][] {
  const lines =
    river.geometry.type === 'LineString' ? [river.geometry.coordinates] : river.geometry.coordinates
  return lines.map((line) =>
    Cesium.Cartesian3.fromDegreesArray(line.flatMap((point) => [point[0] ?? 0, point[1] ?? 0]))
  )
}

function riverColor(level: River['level']): Cesium.Color {
  const colors: Record<number, string> = {
    1: '#38bdf8',
    2: '#22d3ee',
    3: '#94a3b8'
  }
  return Cesium.Color.fromCssColorString(colors[level] ?? '#38bdf8')
}

function popupContent(title: string, rows: Array<[string, string]>): HTMLElement {
  const container = document.createElement('div')
  const heading = document.createElement('div')
  heading.style.fontWeight = '600'
  heading.style.marginBottom = '4px'
  heading.textContent = title
  container.appendChild(heading)
  rows.forEach(([label, value]) => {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.justifyContent = 'space-between'
    row.style.gap = '16px'
    row.style.fontSize = '12px'
    row.style.lineHeight = '1.6'
    const key = document.createElement('span')
    key.style.color = '#9ca3af'
    key.textContent = label
    const text = document.createElement('span')
    text.textContent = value
    row.append(key, text)
    container.appendChild(row)
  })
  return container
}

/** 数据底板：河流、水利工程、监测站点与三维数字镜像。 */
export function createHydroDataFeature(defaultOptions: HydroDataFeatureOptions): HydroDataFeature {
  let data: FloodDataset | null = null
  let ctxRef: FeatureContext | null = null
  let riverEntities: Cesium.Entity[] = []
  let projectEntities: Cesium.Entity[] = []
  let stationEntities: Cesium.Entity[] = []
  let mirrorTileset: Cesium.Cesium3DTileset | null = null
  let popup: PopupHandle | null = null
  const entityMap = new Map<string, Selectable>()
  const nodeIds: string[] = []
  let disposed = false
  let visible = true

  const setEntitiesVisible = (entities: Cesium.Entity[], show: boolean): void => {
    entities.forEach((entity) => {
      entity.show = show
    })
    ctxRef?.viewer.scene.requestRender()
  }

  const attachNode = (
    name: string,
    id: string,
    handle: {
      setVisible: (value: boolean) => void
      setAlpha?: (value: number) => void
      destroy?: () => void
    }
  ): void => {
    if (!ctxRef?.layerManager) return
    try {
      ctxRef.layerManager.addCustom(name, {
        id,
        parentId: ensureFloodLayerGroup(ctxRef),
        handle
      })
      nodeIds.push(id)
    } catch {
      // 图层树重复注册时忽略，实体仍由 FeatureLayerRegistry 回收。
    }
  }

  const closePopup = (): void => {
    popup?.close()
    popup = null
  }

  const select = (item: Selectable | null): void => {
    if (!ctxRef || !item) {
      closePopup()
      defaultOptions.onSelect?.(null)
      return
    }
    if (isStation(item)) {
      const value = item.readings?.[item.readings.length - 1]
      popup = ctxRef.popup.open({
        id: 'flood-station-popup',
        position: { lon: item.lon, lat: item.lat, height: 0 },
        title: item.name,
        content: popupContent(item.name, [
          ['类型', STATION_TYPE_TEXT[item.type] ?? item.type],
          ['最新值', value ? `${value.value} ${value.unit ?? item.unit ?? ''}` : '-']
        ])
      })
    } else if (isProject(item)) {
      popup = ctxRef.popup.open({
        id: 'flood-project-popup',
        position: { lon: item.lon, lat: item.lat, height: 0 },
        title: item.name,
        content: popupContent(item.name, [
          ['类型', PROJECT_TYPE_TEXT[item.type] ?? item.type],
          ['状态', item.status ?? '正常'],
          ['规模', item.capacity ? `${item.capacity} 万m³` : '-']
        ])
      })
    }
    defaultOptions.onSelect?.(item)
  }

  const install = async (ctx: FeatureContext, options?: HydroDataFeatureOptions): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    visible = merged.visible ?? true
    data = await loadFloodDataset(merged.data)
    if (disposed) return

    data.rivers.forEach((river) => {
      riverPositions(river).forEach((positions, index) => {
        const entity = ctx.layers.add(
          new Cesium.Entity({
            id: `flood-river:${river.id}:${index}`,
            name: river.name,
            polyline: {
              positions,
              width: river.level === 1 ? 5 : river.level === 2 ? 3 : 2,
              material: riverColor(river.level)
            }
          })
        )
        riverEntities.push(entity)
        entityMap.set(entity.id, river)
      })
    })

    data.waterProjects.forEach((project) => {
      const color = toCesiumColor(PROJECT_TYPE_COLORS[project.type] ?? '#38bdf8')
      const entity = ctx.layers.add(
        new Cesium.Entity({
          id: `flood-project:${project.id}`,
          name: project.name,
          position: Cesium.Cartesian3.fromDegrees(project.lon, project.lat, 0),
          point: {
            pixelSize: 9,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: project.name,
            font: '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
      projectEntities.push(entity)
      entityMap.set(entity.id, project)
    })

    data.stations.forEach((station) => {
      const color = toCesiumColor(STATION_TYPE_COLORS[station.type] ?? '#22c55e')
      const entity = ctx.layers.add(
        new Cesium.Entity({
          id: `flood-station:${station.id}`,
          name: station.name,
          position: Cesium.Cartesian3.fromDegrees(station.lon, station.lat, 0),
          point: {
            pixelSize: 7,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: station.name,
            font: '11px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
      stationEntities.push(entity)
      entityMap.set(entity.id, station)
    })

    const mirrorUrl = merged.digitalMirrorUrl ?? data.digitalMirrorUrl
    if (mirrorUrl) {
      try {
        mirrorTileset = await ctx.layers.tileset(mirrorUrl, {}, 'flood-digital-mirror')
      } catch (error) {
        ctx.log.warn('三维数字镜像加载失败', error)
      }
    }

    const offPick = ctx.pick.on('click', ({ entity }) => {
      select(entity ? (entityMap.get(entity.id) ?? null) : null)
    })
    const offMiss = ctx.pick.onMiss(() => select(null))
    ctx.layers.onDispose(() => {
      offPick()
      offMiss()
      closePopup()
    })

    attachNode('河流网络', 'flood-rivers', {
      setVisible: (value) => setEntitiesVisible(riverEntities, value),
      destroy: () => setEntitiesVisible(riverEntities, false)
    })
    attachNode('水利工程', 'flood-projects', {
      setVisible: (value) => setEntitiesVisible(projectEntities, value),
      destroy: () => setEntitiesVisible(projectEntities, false)
    })
    attachNode('监测站点', 'flood-stations', {
      setVisible: (value) => setEntitiesVisible(stationEntities, value),
      destroy: () => setEntitiesVisible(stationEntities, false)
    })
    attachNode('三维数字镜像', 'flood-digital-mirror', {
      setVisible: (value) => {
        if (mirrorTileset) mirrorTileset.show = value
      },
      destroy: () => {
        if (mirrorTileset) mirrorTileset.show = false
      }
    })

    if (!visible) setVisible(false)
    ctx.log.info(
      `数据底板已加载：${data.rivers.length} 条河流，${data.waterProjects.length} 个工程，${data.stations.length} 个站点`
    )
  }

  const setVisible = (value: boolean): void => {
    visible = value
    setEntitiesVisible(riverEntities, value)
    setEntitiesVisible(projectEntities, value)
    setEntitiesVisible(stationEntities, value)
    if (mirrorTileset) mirrorTileset.show = value
  }

  const feature: HydroDataFeature = {
    name: defaultOptions.name ?? 'flood-hydro-data',
    get data() {
      return data
    },
    install,
    setRiversVisible(value) {
      setEntitiesVisible(riverEntities, value)
      if (ctxRef?.layerManager?.get('flood-rivers')) {
        ctxRef.layerManager.setVisible('flood-rivers', value)
      }
    },
    setProjectsVisible(value) {
      setEntitiesVisible(projectEntities, value)
      if (ctxRef?.layerManager?.get('flood-projects')) {
        ctxRef.layerManager.setVisible('flood-projects', value)
      }
    },
    setStationsVisible(value) {
      setEntitiesVisible(stationEntities, value)
      if (ctxRef?.layerManager?.get('flood-stations')) {
        ctxRef.layerManager.setVisible('flood-stations', value)
      }
    },
    setDigitalMirrorVisible(value) {
      if (mirrorTileset) mirrorTileset.show = value
      if (ctxRef?.layerManager?.get('flood-digital-mirror')) {
        ctxRef.layerManager.setVisible('flood-digital-mirror', value)
      }
    },
    setVisible,
    flyToDigitalMirror(duration = 1.5) {
      if (!ctxRef || !mirrorTileset) return
      ctxRef.viewer.flyTo(mirrorTileset, { duration })
    },
    flyToBounds(duration = 1.5) {
      if (!ctxRef || !data?.bounds) return
      const { west, south, east, north } = data.bounds
      ctxRef.viewer.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
        duration
      })
    },
    dispose() {
      disposed = true
      if (ctxRef?.layerManager) {
        nodeIds.forEach((id) => {
          if (ctxRef?.layerManager?.get(id)) {
            ctxRef.layerManager.remove(id, { removeSource: false })
          }
        })
      }
      nodeIds.length = 0
      closePopup()
      riverEntities = []
      projectEntities = []
      stationEntities = []
      entityMap.clear()
      mirrorTileset = null
      data = null
      ctxRef = null
    }
  }

  return feature
}
