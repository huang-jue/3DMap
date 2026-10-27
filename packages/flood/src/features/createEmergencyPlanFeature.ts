import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { loadFloodDataset } from '../data/loadFloodData'
import { sampleSeries } from '../data/time'
import { WARNING_TYPE_TEXT } from '../shared/palettes'
import type {
  FloodDataset,
  GeneratedPlan,
  KnowledgeEntry,
  PlanSection,
  PlanTemplate
} from '../shared/types'

export interface PlanGenerateInput {
  warningIds?: string[]
  forecastNodeId?: string
  scenarioId?: string
}

export interface EmergencyPlanFeatureOptions {
  data: FloodDataset | string
  name?: string
  onGenerate?: (plan: GeneratedPlan) => void
}

export interface EmergencyPlanFeature extends CesiumFeature<EmergencyPlanFeatureOptions> {
  readonly data: FloodDataset | null
  readonly knowledge: KnowledgeEntry[]
  readonly plans: PlanTemplate[]
  search(keyword: string): KnowledgeEntry[]
  generate(input?: PlanGenerateInput): GeneratedPlan
}

function matchEntry(entry: KnowledgeEntry, keyword: string): boolean {
  const query = keyword.trim().toLowerCase()
  if (!query) return true
  return (
    entry.title.toLowerCase().includes(query) ||
    entry.content.toLowerCase().includes(query) ||
    entry.tags.some((tag) => tag.toLowerCase().includes(query)) ||
    entry.riskTypes.some((type) => type.toLowerCase().includes(query))
  )
}

function section(title: string, content: string): PlanSection {
  return { title, content }
}

/** 静态知识库与预案生成演示。 */
export function createEmergencyPlanFeature(
  defaultOptions: EmergencyPlanFeatureOptions
): EmergencyPlanFeature {
  let data: FloodDataset | null = null
  let knowledge: KnowledgeEntry[] = []
  let plans: PlanTemplate[] = []
  let ctxRef: FeatureContext | null = null
  let disposed = false

  const install = async (
    ctx: FeatureContext,
    options?: EmergencyPlanFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    data = await loadFloodDataset(merged.data)
    if (disposed) return
    knowledge = data.knowledge
    plans = data.plans
    ctx.log.info(`预案知识库已加载：${knowledge.length} 条知识，${plans.length} 个模板`)
  }

  const generate = (input: PlanGenerateInput = {}): GeneratedPlan => {
    const dataset = data
    const now = ctxRef?.clock.state.currentTime ?? new Date()
    if (!dataset) {
      return {
        title: '水旱灾害防御预案',
        generatedAt: now,
        sections: [section('提示', '数据尚未加载')],
        references: []
      }
    }

    const warnings = input.warningIds?.length
      ? dataset.warnings.filter((warning) => input.warningIds?.includes(warning.id))
      : dataset.warnings.slice(0, 3)
    const node = input.forecastNodeId
      ? dataset.forecastNodes.find((item) => item.id === input.forecastNodeId)
      : dataset.forecastNodes[0]
    const scenario = input.scenarioId
      ? dataset.rehearsals.find((item) => item.id === input.scenarioId)
      : dataset.rehearsals[0]
    const currentValue = node ? sampleSeries(node.series, now) : null
    const references = knowledge
      .filter(
        (entry) =>
          warnings.some((warning) => entry.riskTypes.includes(warning.type)) ||
          entry.tags.some((tag) => tag.includes('调度') || tag.includes('防御'))
      )
      .slice(0, 3)

    const warningText = warnings.length
      ? warnings
          .map(
            (warning) =>
              `${warning.title}（${WARNING_TYPE_TEXT[warning.type] ?? warning.type}·${warning.level}）`
          )
          .join('；')
      : '当前未选择风险预警'

    const template = dataset.plans[0]
    const sections: PlanSection[] = template
      ? template.sections.map((item) => ({
          title: item.title,
          content: item.content
            .replace(/\{\{warnings\}\}/g, warningText)
            .replace(
              /\{\{forecast\}\}/g,
              node
                ? `${node.name} 当前 ${currentValue === null ? '-' : currentValue.toFixed(2)} ${node.unit ?? 'm'}`
                : '暂无预报节点'
            )
            .replace(/\{\{scenario\}\}/g, scenario?.name ?? '暂无预演场景')
        }))
      : [
          section('风险概况', warningText),
          section(
            '预报结论',
            node
              ? `${node.name} 当前预报值 ${currentValue === null ? '-' : currentValue.toFixed(2)} ${node.unit ?? 'm'}`
              : '暂无预报节点'
          ),
          section(
            '调度建议',
            scenario?.dispatch?.steps.join('；') ?? '建议结合实时雨水情滚动会商，适时启动联合调度。'
          ),
          section(
            '防御措施',
            references.map((entry) => entry.content).join('\n') ||
              '加强巡查值守，重点关注病险水库、山洪灾害易发区和中小河流。'
          ),
          section('责任分工', '按流域防总统一部署，地方各级防御责任人到岗到位。')
        ]

    const plan: GeneratedPlan = {
      title: `${dataset.name ?? '珠江流域'}水旱灾害防御预案`,
      generatedAt: now,
      sections,
      references
    }
    defaultOptions.onGenerate?.(plan)
    return plan
  }

  const feature: EmergencyPlanFeature = {
    name: defaultOptions.name ?? 'flood-emergency-plan',
    get data() {
      return data
    },
    get knowledge() {
      return knowledge
    },
    get plans() {
      return plans
    },
    install,
    search(keyword) {
      return knowledge.filter((entry) => matchEntry(entry, keyword))
    },
    generate,
    dispose() {
      disposed = true
      knowledge = []
      plans = []
      data = null
      ctxRef = null
    }
  }

  return feature
}
