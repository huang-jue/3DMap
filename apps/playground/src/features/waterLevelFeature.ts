import * as Cesium from 'cesium'
import type { CesiumFeature } from '@sgyx/cesium-kit-core'

export interface WaterLevelOptions {
  start?: Date
  end?: Date
  /** 最大水位抬升高度（米） */
  maxHeight?: number
  /** 时间倍速 */
  multiplier?: number
}

const RING = [112.6, 30.2, 114.4, 30.2, 114.6, 31.0, 112.8, 31.1]

function formatTime(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * 示例业务插件：用水位面演示 ClockService 的帧驱动能力。
 * 只使用公开契约（ctx.clock / ctx.layers），可作为后续洪水演进插件的骨架。
 */
export const waterLevelFeature: CesiumFeature<WaterLevelOptions> = {
  name: 'demo-water-level',
  install(ctx, options = {}) {
    const start = options.start ?? new Date('2026-07-01T00:00:00Z')
    const end = options.end ?? new Date('2026-07-10T00:00:00Z')
    const maxHeight = options.maxHeight ?? 180
    const startMs = start.getTime()
    const endMs = end.getTime()

    const progress = (): number => {
      const now = ctx.clock.state.currentTime.getTime()
      if (endMs <= startMs) return 0
      return Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)))
    }
    const currentHeight = (): number => 10 + progress() * maxHeight

    ctx.clock.setRange(start, end)
    ctx.clock.seek(start)
    ctx.clock.setMultiplier(options.multiplier ?? 21600)
    ctx.clock.play()

    ctx.layers.add(
      new Cesium.Entity({
        name: '水位面',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(RING)
          ),
          material: new Cesium.ColorMaterialProperty(
            Cesium.Color.fromCssColorString('#409eff').withAlpha(0.55)
          ),
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          extrudedHeight: new Cesium.CallbackProperty(currentHeight, false)
        }
      })
    )

    ctx.layers.add(
      new Cesium.Entity({
        position: Cesium.Cartesian3.fromDegrees(113.6, 30.65, 0),
        label: {
          text: new Cesium.CallbackProperty(
            () =>
              `水位 ${currentHeight().toFixed(0)} m  ·  ${formatTime(
                ctx.clock.state.currentTime
              )}`,
            false
          ),
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
      })
    )

    ctx.layers.onDispose(() => {
      ctx.clock.pause()
      ctx.clock.setMultiplier(1)
    })

    ctx.log.info('水位演示插件已启动')
  }
}
