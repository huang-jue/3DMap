import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUTPUT_DIR = fileURLToPath(new URL('../apps/playground/public/data/flood/', import.meta.url))

const BOUNDS = { west: 102, south: 20, east: 117, north: 27 }
const START = Date.parse('2026-07-01T00:00:00.000Z')
const FRAME_COUNT = 13
const STEP_HOURS = 6

const round = (value, digits = 1) => {
  const base = 10 ** digits
  return Math.round(value * base) / base
}

function timeAt(index, stepHours = STEP_HOURS) {
  return new Date(START + index * stepHours * 3600_000)
}

function gauss(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx
  const dy = (y - cy) / sy
  return Math.exp(-(dx * dx + dy * dy))
}

const RIVERS = [
  {
    id: 'xijiang',
    name: '西江',
    level: 1,
    geometry: {
      type: 'LineString',
      coordinates: [
        [104.6, 24.3],
        [106.2, 23.7],
        [108.1, 23.3],
        [110.2, 23.0],
        [112.2, 22.6],
        [113.3, 22.3]
      ]
    }
  },
  {
    id: 'beijiang',
    name: '北江',
    level: 1,
    geometry: {
      type: 'LineString',
      coordinates: [
        [113.0, 25.5],
        [112.6, 24.7],
        [112.3, 24.0],
        [112.8, 23.4],
        [113.2, 22.9]
      ]
    }
  },
  {
    id: 'dongjiang',
    name: '东江',
    level: 1,
    geometry: {
      type: 'LineString',
      coordinates: [
        [114.6, 24.6],
        [114.0, 23.9],
        [113.8, 23.3],
        [113.7, 22.8]
      ]
    }
  },
  {
    id: 'hanjiang',
    name: '韩江',
    level: 1,
    geometry: {
      type: 'LineString',
      coordinates: [
        [116.2, 25.4],
        [116.5, 24.6],
        [116.7, 23.9],
        [116.8, 23.2]
      ]
    }
  },
  {
    id: 'yujiang',
    name: '郁江',
    level: 2,
    geometry: {
      type: 'LineString',
      coordinates: [
        [105.0, 23.8],
        [107.0, 23.4],
        [109.0, 23.2],
        [110.8, 23.0]
      ]
    }
  },
  {
    id: 'liujiang',
    name: '柳江',
    level: 2,
    geometry: {
      type: 'LineString',
      coordinates: [
        [108.6, 25.0],
        [109.2, 24.4],
        [109.8, 23.8],
        [110.4, 23.3]
      ]
    }
  },
  {
    id: 'guijiang',
    name: '桂江',
    level: 2,
    geometry: {
      type: 'LineString',
      coordinates: [
        [110.4, 25.4],
        [110.7, 24.7],
        [111.2, 24.0],
        [111.8, 23.4]
      ]
    }
  },
  {
    id: 'hejiang',
    name: '贺江',
    level: 3,
    geometry: {
      type: 'LineString',
      coordinates: [
        [111.4, 24.6],
        [111.7, 24.0],
        [112.1, 23.5],
        [112.4, 23.1]
      ]
    }
  },
  {
    id: 'luoding',
    name: '罗定江',
    level: 3,
    geometry: {
      type: 'LineString',
      coordinates: [
        [111.1, 22.8],
        [111.7, 22.7],
        [112.3, 22.9],
        [112.7, 23.0]
      ]
    }
  },
  {
    id: 'tanjiang',
    name: '潭江',
    level: 3,
    geometry: {
      type: 'LineString',
      coordinates: [
        [112.0, 22.3],
        [112.6, 22.2],
        [113.1, 22.3],
        [113.4, 22.2]
      ]
    }
  },
  {
    id: 'pearl-estuary',
    name: '珠江口',
    level: 1,
    geometry: {
      type: 'LineString',
      coordinates: [
        [113.2, 22.7],
        [113.5, 22.4],
        [113.7, 22.0],
        [113.8, 21.7]
      ]
    }
  }
]

const WATER_PROJECTS = [
  {
    id: 'longtan',
    name: '龙滩水库',
    type: 'reservoir',
    lon: 107.1,
    lat: 25.1,
    capacity: 273000,
    status: '正常'
  },
  {
    id: 'baise',
    name: '百色水库',
    type: 'reservoir',
    lon: 106.6,
    lat: 23.9,
    capacity: 56600,
    status: '正常'
  },
  {
    id: 'xijin',
    name: '西津水库',
    type: 'reservoir',
    lon: 110.2,
    lat: 23.5,
    capacity: 30000,
    status: '正常'
  },
  {
    id: 'feilaixia',
    name: '飞来峡水库',
    type: 'reservoir',
    lon: 113.3,
    lat: 23.8,
    capacity: 42000,
    status: '关注'
  },
  {
    id: 'xinfengjiang',
    name: '新丰江水库',
    type: 'reservoir',
    lon: 114.4,
    lat: 23.8,
    capacity: 139000,
    status: '正常'
  },
  {
    id: 'gaozhou',
    name: '高州水库',
    type: 'reservoir',
    lon: 111.9,
    lat: 21.9,
    capacity: 11400,
    status: '正常'
  },
  {
    id: 'mianhuatan',
    name: '棉花滩水库',
    type: 'reservoir',
    lon: 116.6,
    lat: 24.8,
    capacity: 22200,
    status: '正常'
  },
  {
    id: 'hanjiang-gate',
    name: '韩江枢纽',
    type: 'gate',
    lon: 116.7,
    lat: 23.5,
    capacity: 0,
    status: '正常'
  }
]

const STATION_TEMPLATES = [
  ['wuzhou', '梧州站', 'waterLevel', 111.3, 23.5, 'm'],
  ['zhaoqing', '肇庆站', 'waterLevel', 112.5, 23.05, 'm'],
  ['shijiao', '石角站', 'flow', 113.1, 23.7, 'm³/s'],
  ['boluo', '博罗站', 'waterLevel', 114.3, 23.2, 'm'],
  ['nanning', '南宁站', 'rainfall', 108.4, 22.8, 'mm'],
  ['liuzhou', '柳州站', 'waterLevel', 109.4, 24.3, 'm'],
  ['guilin', '桂林站', 'rainfall', 110.3, 25.3, 'mm'],
  ['longtan', '龙滩站', 'waterLevel', 107.1, 25.05, 'm'],
  ['yangjiang', '阳江站', 'tide', 111.9, 21.8, 'm'],
  ['shantou', '汕头站', 'tide', 116.7, 23.3, 'm']
]

const FORECAST_TEMPLATES = [
  ['wuzhou', '梧州预报断面', 111.3, 23.5, 'warning', 18.5],
  ['zhaoqing', '肇庆预报断面', 112.5, 23.05, 'attention', 12.2],
  ['shijiao', '石角预报断面', 113.1, 23.7, 'guarantee', 14.8],
  ['boluo', '博罗预报断面', 114.3, 23.2, 'warning', 10.5],
  ['nanning', '南宁预报断面', 108.4, 22.8, 'normal', 8.1],
  ['liuzhou', '柳州预报断面', 109.4, 24.3, 'attention', 15.2],
  ['guilin', '桂林预报断面', 110.3, 25.3, 'normal', 6.8],
  ['longtan', '龙滩入库断面', 107.1, 25.05, 'warning', 21.3],
  ['feilaixia', '飞来峡断面', 113.3, 23.8, 'warning', 13.6],
  ['xinfengjiang', '新丰江断面', 114.4, 23.8, 'attention', 9.4],
  ['mianhuatan', '棉花滩断面', 116.6, 24.8, 'normal', 7.2],
  ['hanjiang', '韩江断面', 116.7, 23.5, 'attention', 11.1]
]

function buildStations() {
  return STATION_TEMPLATES.map(([id, name, type, lon, lat, unit], index) => ({
    id,
    name,
    type,
    lon,
    lat,
    unit,
    readings: Array.from({ length: FRAME_COUNT }, (_, frameIndex) => ({
      time: timeAt(frameIndex).toISOString(),
      value: round(
        (type === 'rainfall' ? 8 : type === 'tide' ? 2.5 : 8) +
          Math.sin(frameIndex * 0.6 + index) * (type === 'rainfall' ? 8 : 1.5) +
          index * 0.3,
        2
      ),
      unit
    }))
  }))
}

function buildForecastNodes() {
  return FORECAST_TEMPLATES.map(([id, name, lon, lat, warningLevel, base], index) => ({
    id,
    name,
    lon,
    lat,
    warningLevel,
    unit: 'm',
    series: Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
      const forecast = frameIndex >= 6
      const trend = forecast ? (frameIndex - 5) * 0.42 : frameIndex * 0.23
      return {
        time: timeAt(frameIndex).toISOString(),
        value: round(base + trend + Math.sin(frameIndex * 0.7 + index) * 0.5, 2),
        forecast
      }
    })
  }))
}

function buildRainfallFrames() {
  const width = 24
  const height = 16
  const bounds = { west: 104, south: 21, east: 116, north: 26 }
  return Array.from({ length: 6 }, (_, frameIndex) => {
    const values = []
    const cx = 107 + frameIndex * 1.2
    const cy = 23.5 + Math.sin(frameIndex * 0.7) * 1.2
    for (let y = 0; y < height; y += 1) {
      const lat = bounds.south + (y / (height - 1)) * (bounds.north - bounds.south)
      for (let x = 0; x < width; x += 1) {
        const lon = bounds.west + (x / (width - 1)) * (bounds.east - bounds.west)
        const value = 30 * gauss(lon, lat, cx, cy, 2.8, 1.8)
        values.push(value < 0.5 ? -999 : round(value, 1))
      }
    }
    return {
      time: timeAt(frameIndex).toISOString(),
      bounds,
      width,
      height,
      noData: -999,
      values
    }
  })
}

function buildRasterFrames() {
  const width = 48
  const height = 32
  const bounds = { west: 110.5, south: 21.5, east: 114.5, north: 23.9 }
  return Array.from({ length: 6 }, (_, frameIndex) => {
    const values = []
    const cx = 111.2 + frameIndex * 0.45
    const cy = 22.6 + Math.sin(frameIndex * 0.7) * 0.25
    for (let y = 0; y < height; y += 1) {
      const lat = bounds.south + (y / (height - 1)) * (bounds.north - bounds.south)
      for (let x = 0; x < width; x += 1) {
        const lon = bounds.west + (x / (width - 1)) * (bounds.east - bounds.west)
        const depth = 8.5 * gauss(lon, lat, cx, cy, 1.5, 0.8) * (0.65 + frameIndex * 0.08)
        values.push(depth < 0.15 ? -999 : round(depth, 2))
      }
    }
    return {
      time: timeAt(frameIndex).toISOString(),
      bounds,
      width,
      height,
      noData: -999,
      values
    }
  })
}

function buildPolygonFrames() {
  return Array.from({ length: 6 }, (_, frameIndex) => {
    const grow = frameIndex * 0.08
    return {
      time: timeAt(frameIndex).toISOString(),
      features: [
        {
          id: `zhaoqing-${frameIndex}`,
          name: '肇庆淹没区',
          depth: round(1.2 + frameIndex * 0.45, 2),
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [112.3 - grow, 22.9 - grow],
                [112.8 + grow, 22.9 - grow],
                [112.8 + grow, 23.3 + grow],
                [112.3 - grow, 23.3 + grow],
                [112.3 - grow, 22.9 - grow]
              ]
            ]
          }
        },
        {
          id: `foshan-${frameIndex}`,
          name: '佛山淹没区',
          depth: round(0.8 + frameIndex * 0.32, 2),
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [112.9 - grow, 22.6 - grow],
                [113.3 + grow, 22.6 - grow],
                [113.3 + grow, 22.95 + grow],
                [112.9 - grow, 22.95 + grow],
                [112.9 - grow, 22.6 - grow]
              ]
            ]
          }
        }
      ]
    }
  })
}

function buildWarnings() {
  return [
    {
      id: 'warn-reservoir-1',
      type: 'dangerous-reservoir',
      level: 'yellow',
      title: '病险水库风险',
      description: '坝体存在渗漏风险，建议降低水位并加强巡查。',
      lon: 107.5,
      lat: 24.0,
      population: 12000,
      startTime: timeAt(0).toISOString(),
      endTime: timeAt(6).toISOString()
    },
    {
      id: 'warn-reservoir-2',
      type: 'small-reservoir',
      level: 'orange',
      title: '中小水库超汛限',
      description: '当前水位已超汛限 0.8 米，需关注下游安全。',
      lon: 110.8,
      lat: 23.2,
      population: 26000,
      startTime: timeAt(1).toISOString(),
      endTime: timeAt(8).toISOString()
    },
    {
      id: 'warn-mountain-1',
      type: 'mountain-flood',
      level: 'red',
      title: '山洪灾害高风险区',
      description: '短时强降雨可能引发山洪，建议提前转移危险区人员。',
      lon: 111.5,
      lat: 21.8,
      population: 8400,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [111.0, 21.5],
            [112.0, 21.5],
            [112.0, 22.2],
            [111.0, 22.2],
            [111.0, 21.5]
          ]
        ]
      },
      startTime: timeAt(2).toISOString(),
      endTime: timeAt(10).toISOString()
    },
    {
      id: 'warn-river-1',
      type: 'river-risk',
      level: 'yellow',
      title: '中小河流洪水风险',
      description: '北江支流可能出现超警洪水。',
      lon: 112.6,
      lat: 23.4,
      population: 15000,
      startTime: timeAt(0).toISOString(),
      endTime: timeAt(12).toISOString()
    },
    {
      id: 'warn-urban-1',
      type: 'urban-flood',
      level: 'blue',
      title: '城市内涝风险',
      description: '局地短时强降雨可能造成低洼路段积水。',
      lon: 113.3,
      lat: 23.1,
      population: 32000,
      startTime: timeAt(3).toISOString(),
      endTime: timeAt(9).toISOString()
    },
    {
      id: 'warn-reservoir-3',
      type: 'small-reservoir',
      level: 'orange',
      title: '东江中小水库风险',
      description: '水库入库流量快速上涨，建议预泄腾库。',
      lon: 114.0,
      lat: 23.8,
      population: 18000,
      startTime: timeAt(4).toISOString(),
      endTime: timeAt(11).toISOString()
    }
  ]
}

function buildRehearsals(rasterFrames, polygonFrames) {
  const floodStart = timeAt(0)
  const floodEnd = timeAt(5)
  const dispatchProjects = [
    {
      id: 'longtan',
      name: '龙滩水库',
      lon: 107.1,
      lat: 25.1,
      inflow: 4200,
      outflow: 3800,
      level: 374.2,
      series: Array.from({ length: 6 }, (_, i) => ({
        time: timeAt(i).toISOString(),
        inflow: round(4200 + i * 320 + Math.sin(i) * 180, 0),
        outflow: round(3600 + i * 260, 0),
        level: round(373.8 + i * 0.16, 2)
      }))
    },
    {
      id: 'feilaixia',
      name: '飞来峡水库',
      lon: 113.3,
      lat: 23.8,
      inflow: 8600,
      outflow: 7200,
      level: 24.3,
      series: Array.from({ length: 6 }, (_, i) => ({
        time: timeAt(i).toISOString(),
        inflow: round(8600 + i * 520 + Math.cos(i) * 220, 0),
        outflow: round(7000 + i * 430, 0),
        level: round(23.9 + i * 0.2, 2)
      }))
    },
    {
      id: 'xinfengjiang',
      name: '新丰江水库',
      lon: 114.4,
      lat: 23.8,
      inflow: 3100,
      outflow: 2600,
      level: 116.4,
      series: Array.from({ length: 6 }, (_, i) => ({
        time: timeAt(i).toISOString(),
        inflow: round(3100 + i * 240, 0),
        outflow: round(2400 + i * 180, 0),
        level: round(116.1 + i * 0.12, 2)
      }))
    }
  ]

  return [
    {
      id: 'flood-2026-07',
      name: '北江下游洪水淹没预演',
      type: 'flood',
      startTime: floodStart.toISOString(),
      endTime: floodEnd.toISOString(),
      rasterFrames,
      polygonFrames
    },
    {
      id: 'breach-2026-07',
      name: '北江堤防溃口推演',
      type: 'breach',
      startTime: floodStart.toISOString(),
      endTime: floodEnd.toISOString(),
      rasterFrames,
      polygonFrames,
      breach: {
        lon: 112.8,
        lat: 23.1,
        width: 80,
        peakFlow: 5200,
        hydrograph: Array.from({ length: 6 }, (_, i) => ({
          time: timeAt(i).toISOString(),
          flow: round(5200 * Math.exp(-((i - 2.5) ** 2) / 2.2), 0)
        }))
      }
    },
    {
      id: 'dispatch-2026-07',
      name: '流域水库群联合调度',
      type: 'dispatch',
      startTime: floodStart.toISOString(),
      endTime: floodEnd.toISOString(),
      dispatch: {
        name: '北江洪水联合调度方案',
        steps: [
          '龙滩水库预泄腾库，出库流量控制在 3800 m³/s',
          '飞来峡水库按 7200 m³/s 控泄，减轻下游压力',
          '新丰江水库同步拦蓄，动态调整出库',
          '根据实时雨情滚动修正调度方案'
        ],
        projects: dispatchProjects
      }
    }
  ]
}

const KNOWLEDGE = [
  {
    id: 'kb-1',
    title: '病险水库风险处置要点',
    tags: ['水库', '巡查', '预泄'],
    riskTypes: ['dangerous-reservoir', 'small-reservoir'],
    content: '降低水位运行，加密坝体、溢洪道和放水设施巡查；提前通知下游影响区，必要时转移人员。'
  },
  {
    id: 'kb-2',
    title: '山洪灾害防御指南',
    tags: ['山洪', '转移', '预警'],
    riskTypes: ['mountain-flood'],
    content: '接到红色预警后立即组织危险区人员转移，封闭危险道路，安排专人值守。'
  },
  {
    id: 'kb-3',
    title: '中小河流洪水防御',
    tags: ['中小河流', '巡堤', '抢险'],
    riskTypes: ['river-risk'],
    content: '加强超警河段巡堤查险，提前预置抢险队伍和物资，关注支流汇流叠加影响。'
  },
  {
    id: 'kb-4',
    title: '城市内涝应对',
    tags: ['内涝', '排水', '交通'],
    riskTypes: ['urban-flood'],
    content: '提前清理排水管网，布控低洼路段和地下空间，及时发布交通绕行提示。'
  },
  {
    id: 'kb-5',
    title: '水库群联合调度原则',
    tags: ['调度', '水库群', '防洪'],
    riskTypes: ['dangerous-reservoir', 'river-risk'],
    content: '按照“一个流量、一方库容、一厘米水位”精细调度，统筹上下游、干支流和库群联合运用。'
  }
]

const PLANS = [
  {
    id: 'plan-1',
    name: '流域洪水防御预案',
    sections: [
      {
        title: '风险概况',
        content: '当前重点关注：{{warnings}}。'
      },
      {
        title: '预报结论',
        content: '{{forecast}}。建议滚动会商，密切关注后续降雨。'
      },
      {
        title: '调度建议',
        content: '结合「{{scenario}}」预演结果，按照水库群联合调度方案控制出库流量。'
      },
      {
        title: '防御措施',
        content: '加强病险水库、山洪危险区和中小河流巡查值守，提前预置抢险力量。'
      },
      {
        title: '责任分工',
        content: '流域防总统一指挥，地方各级责任人到岗到位，按预案落实转移和抢险措施。'
      }
    ]
  }
]

const rasterFrames = buildRasterFrames()
const polygonFrames = buildPolygonFrames()

const dataset = {
  name: '珠江流域水旱灾害防御四预样例',
  bounds: BOUNDS,
  digitalMirrorUrl: '/tiles/demo/tileset.json',
  rivers: RIVERS,
  waterProjects: WATER_PROJECTS,
  stations: buildStations(),
  forecastNodes: buildForecastNodes(),
  rainfallFrames: buildRainfallFrames(),
  warnings: buildWarnings(),
  rehearsals: buildRehearsals(rasterFrames, polygonFrames),
  knowledge: KNOWLEDGE,
  plans: PLANS
}

mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(`${OUTPUT_DIR}flood.json`, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
console.log(`[flood] 已生成样例数据：${OUTPUT_DIR}flood.json`)
