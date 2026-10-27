import { describe, expect, it } from 'vitest'
import { parseFloodDataset } from '../src/data/parseFloodData'
import { sampleSeries } from '../src/data/time'

const bounds = { west: 102, south: 20, east: 117, north: 27 }

function payload() {
  return {
    name: '样例',
    bounds,
    rivers: [
      {
        id: 'r1',
        name: '西江',
        level: 1,
        geometry: {
          type: 'LineString',
          coordinates: [
            [104, 24],
            [110, 23]
          ]
        }
      }
    ],
    waterProjects: [
      {
        id: 'p1',
        name: '龙滩水库',
        type: 'reservoir',
        lon: 107.1,
        lat: 25.1
      }
    ],
    stations: [
      {
        id: 's1',
        name: '梧州站',
        type: 'waterLevel',
        lon: 111.3,
        lat: 23.5,
        readings: [{ time: '2026-07-01T00:00:00Z', value: 18.2, unit: 'm' }]
      }
    ],
    forecastNodes: [
      {
        id: 'f1',
        name: '梧州断面',
        lon: 111.3,
        lat: 23.5,
        warningLevel: 'warning',
        unit: 'm',
        series: [
          { time: '2026-07-01T00:00:00Z', value: 18, forecast: false },
          { time: '2026-07-01T06:00:00Z', value: 19, forecast: true }
        ]
      }
    ],
    rainfallFrames: [
      {
        time: '2026-07-01T00:00:00Z',
        bounds,
        width: 2,
        height: 2,
        values: [0, 1, 2, 3]
      }
    ],
    warnings: [
      {
        id: 'w1',
        type: 'river-risk',
        level: 'yellow',
        title: '中小河流风险',
        lon: 112.5,
        lat: 23.1
      }
    ],
    rehearsals: [
      {
        id: 'r1',
        name: '洪水预演',
        type: 'flood',
        startTime: '2026-07-01T00:00:00Z',
        endTime: '2026-07-01T06:00:00Z',
        rasterFrames: [
          {
            time: '2026-07-01T00:00:00Z',
            bounds,
            width: 2,
            height: 2,
            values: [0, 1, 2, 3],
            noData: -999
          }
        ],
        polygonFrames: [
          {
            time: '2026-07-01T00:00:00Z',
            features: [
              {
                id: 'poly-1',
                name: '淹没区',
                depth: 1.2,
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [112, 22],
                      [113, 22],
                      [113, 23],
                      [112, 22]
                    ]
                  ]
                }
              }
            ]
          }
        ]
      }
    ],
    knowledge: [
      {
        id: 'k1',
        title: '中小河流防御',
        tags: ['巡堤'],
        riskTypes: ['river-risk'],
        content: '加强巡查。'
      }
    ],
    plans: [
      {
        id: 'p1',
        name: '防御预案',
        sections: [{ title: '风险概况', content: '{{warnings}}' }]
      }
    ]
  }
}

describe('parseFloodDataset', () => {
  it('解析完整四预数据集', () => {
    const data = parseFloodDataset(payload())
    expect(data.rivers).toHaveLength(1)
    expect(data.waterProjects[0]?.name).toBe('龙滩水库')
    expect(data.stations[0]?.readings?.[0]?.time).toBeInstanceOf(Date)
    expect(data.forecastNodes[0]?.series[1]?.forecast).toBe(true)
    expect(data.rainfallFrames?.[0]?.values.length).toBe(4)
    expect(data.warnings[0]?.level).toBe('yellow')
    expect(data.rehearsals[0]?.rasterFrames?.[0]?.time).toBeInstanceOf(Date)
    expect(data.rehearsals[0]?.polygonFrames?.[0]?.features[0]?.depth).toBe(1.2)
    expect(data.knowledge[0]?.title).toBe('中小河流防御')
    expect(data.plans[0]?.sections[0]?.content).toBe('{{warnings}}')
  })

  it('拒绝长度不匹配的栅格帧', () => {
    const input = payload()
    input.rehearsals[0]!.rasterFrames[0]!.values = [1, 2]
    expect(() => parseFloodDataset(input)).toThrow('长度不匹配')
  })
})

describe('sampleSeries', () => {
  it('按时间线性插值', () => {
    const value = sampleSeries(
      [
        { time: new Date('2026-07-01T00:00:00Z'), value: 10 },
        { time: new Date('2026-07-01T02:00:00Z'), value: 14 }
      ],
      new Date('2026-07-01T01:00:00Z')
    )
    expect(value).toBe(12)
  })
})
