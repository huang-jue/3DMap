import type { FloodWarningLevel, ForecastWarningLevel } from './types'

export const DEPTH_COLORS = [
  'rgba(255, 255, 255, 0)',
  '#38bdf8',
  '#22d3ee',
  '#34d399',
  '#facc15',
  '#f97316',
  '#ef4444'
]

export const RAINFALL_COLORS = [
  'rgba(255, 255, 255, 0)',
  '#38bdf8',
  '#22d3ee',
  '#34d399',
  '#facc15',
  '#f97316',
  '#ef4444'
]

export const FORECAST_LEVEL_COLORS: Record<ForecastWarningLevel, string> = {
  normal: '#67c23a',
  attention: '#e6a23c',
  warning: '#f56c6c',
  guarantee: '#c026d3'
}

export const WARNING_LEVEL_COLORS: Record<FloodWarningLevel, string> = {
  blue: '#3b82f6',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444'
}

export const PROJECT_TYPE_COLORS: Record<string, string> = {
  reservoir: '#38bdf8',
  dam: '#f59e0b',
  gate: '#22c55e',
  pump: '#a855f7',
  hydropower: '#eab308'
}

export const STATION_TYPE_COLORS: Record<string, string> = {
  rainfall: '#38bdf8',
  waterLevel: '#22c55e',
  flow: '#f59e0b',
  tide: '#a855f7'
}

export const WARNING_LEVEL_TEXT: Record<FloodWarningLevel, string> = {
  blue: '蓝色',
  yellow: '黄色',
  orange: '橙色',
  red: '红色'
}

export const WARNING_TYPE_TEXT: Record<string, string> = {
  'dangerous-reservoir': '病险水库',
  'small-reservoir': '中小水库',
  'mountain-flood': '山洪灾害',
  'river-risk': '中小河流',
  'urban-flood': '城市内涝'
}

export const PROJECT_TYPE_TEXT: Record<string, string> = {
  reservoir: '水库',
  dam: '堤防',
  gate: '水闸',
  pump: '泵站',
  hydropower: '水电站'
}

export const STATION_TYPE_TEXT: Record<string, string> = {
  rainfall: '雨量站',
  waterLevel: '水位站',
  flow: '流量站',
  tide: '潮位站'
}
