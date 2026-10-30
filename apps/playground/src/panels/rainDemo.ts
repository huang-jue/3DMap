import { parseOpenMeteoRain, type RainForecastProvider } from '@sgyx/cesium-kit-weather'

export const demoRainProvider: RainForecastProvider = {
  id: 'local-rain-demo',
  async load(_lon, _lat, { signal }) {
    const response = await fetch('/data/weather/rain-demo.json', { signal })
    if (!response.ok) throw new Error('离线演示数据加载失败')
    const raw = await response.json()
    return {
      ...parseOpenMeteoRain(raw),
      mode: 'demo',
      source: '本地固定演示曲线（非位置实况）',
      sourceUrl: undefined,
      referenceTime: raw.referenceTime
    }
  }
}
