import { describe, expect, it, vi } from 'vitest'
import { createEmergencyPlanFeature } from '../src/features/createEmergencyPlanFeature'
import type { FloodDataset } from '../src/shared/types'

function dataset(): FloodDataset {
  return {
    name: '珠江样例',
    rivers: [],
    waterProjects: [],
    stations: [],
    forecastNodes: [
      {
        id: 'f1',
        name: '梧州断面',
        lon: 111.3,
        lat: 23.5,
        warningLevel: 'warning',
        unit: 'm',
        series: [
          { time: new Date('2026-07-01T00:00:00Z'), value: 18, forecast: false },
          { time: new Date('2026-07-01T06:00:00Z'), value: 19, forecast: true }
        ]
      }
    ],
    warnings: [
      {
        id: 'w1',
        type: 'river-risk',
        level: 'yellow',
        title: '中小河流风险'
      }
    ],
    rehearsals: [],
    knowledge: [
      {
        id: 'k1',
        title: '中小河流防御',
        tags: ['巡堤'],
        riskTypes: ['river-risk'],
        content: '加强巡堤查险。'
      }
    ],
    plans: [
      {
        id: 'p1',
        name: '防御预案',
        sections: [
          { title: '风险概况', content: '{{warnings}}' },
          { title: '预报结论', content: '{{forecast}}' }
        ]
      }
    ]
  }
}

function ctx() {
  return {
    clock: {
      state: { currentTime: new Date('2026-07-01T06:00:00Z') }
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  }
}

describe('EmergencyPlanFeature', () => {
  it('检索知识库并生成预案', async () => {
    const feature = createEmergencyPlanFeature({ data: dataset() })
    await feature.install(ctx() as never, { data: dataset() })

    expect(feature.search('巡堤')).toHaveLength(1)
    expect(feature.search('不存在')).toHaveLength(0)

    const plan = feature.generate({ warningIds: ['w1'], forecastNodeId: 'f1' })
    expect(plan.title).toContain('珠江样例')
    expect(plan.sections[0]?.content).toContain('中小河流风险')
    expect(plan.sections[1]?.content).toContain('梧州断面')
    expect(plan.references[0]?.id).toBe('k1')
  })
})
