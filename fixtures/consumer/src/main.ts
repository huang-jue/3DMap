import { createApp } from 'vue'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import '@sgyx/cesium-kit-vue/style.css'
import { CesiumKit } from '@sgyx/cesium-kit-vue'
import App from './App.vue'

createApp(App).use(CesiumKit, { defaultViewerOptions: { showCredits: false } }).mount('#app')
