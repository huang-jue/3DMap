import { createApp } from 'vue'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import '@cesium-kit/vue/style.css'
import { CesiumKit } from '@cesium-kit/vue'
import App from './App.vue'

createApp(App).use(CesiumKit, { defaultViewerOptions: { showCredits: false } }).mount('#app')
