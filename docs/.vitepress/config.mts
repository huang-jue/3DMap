import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Cesium Kit',
  description: '以 Cesium 为底座的基础能力库与业务插件框架',
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/core' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: 'Viewer 与能力', link: '/guide/viewer' },
            { text: '图层与数据源', link: '/guide/layers' },
            { text: '图层树与顺序', link: '/guide/layer-tree' },
            { text: '绘制与量算', link: '/guide/draw-measure' },
            { text: '成果、场景快照与选择', link: '/guide/persistence-selection' },
            { text: '弹窗与标注聚合', link: '/guide/popup-cluster' },
            { text: '时间轴', link: '/guide/time' },
            { text: '天气预报', link: '/guide/weather' },
            { text: '水旱灾害防御四预', link: '/guide/flood' },
            { text: '地球可视化', link: '/guide/earth' },
            { text: '地球分析与地图对比', link: '/guide/earth-analysis' },
            { text: '风场', link: '/guide/wind' },
            { text: '业务插件开发', link: '/guide/feature' },
            { text: '常见问题', link: '/guide/faq' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API',
          items: [
            { text: '@sgyx/cesium-kit-core', link: '/api/core' },
            { text: '@sgyx/cesium-kit-vue', link: '/api/vue' },
            { text: '@sgyx/cesium-kit-weather', link: '/api/weather' },
            { text: '@sgyx/cesium-kit-flood', link: '/api/flood' },
            { text: '@sgyx/cesium-kit-earth', link: '/api/earth' },
            { text: '@sgyx/cesium-kit-wind', link: '/api/wind' },
            { text: '@sgyx/cesium-kit-vite', link: '/api/vite' }
          ]
        }
      ]
    },
    outline: { label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    search: { provider: 'local' }
  }
})
