<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import {
  CesiumViewerManager,
  type CameraView,
  type CesiumKitErrorPayload,
  type CesiumKitOptions,
  type SceneModeName
} from '@cesium-kit/core'
import {
  CESIUM_KIT_CONTEXT_KEY,
  CESIUM_KIT_OPTIONS_KEY,
  createCesiumContext
} from '../context'
import type { CesiumKitPluginOptions } from '../plugin'

defineOptions({ name: 'CesiumViewer' })

const props = withDefaults(
  defineProps<{
    /** Viewer 初始化选项，仅在首次挂载时生效 */
    options?: CesiumKitOptions
    ionToken?: string
    /** 初始底图 id（预设名或自定义 id） */
    baseLayer?: string
    sceneMode?: SceneModeName
    /** 是否自动初始化，false 时可手动调用 expose 的 init() */
    autoInit?: boolean
  }>(),
  { autoInit: true }
)

const emit = defineEmits<{
  ready: [manager: CesiumViewerManager]
  error: [payload: CesiumKitErrorPayload]
  'camera-change': [view: CameraView]
  'imagery-change': [id: string | null]
  'scene-mode': [mode: SceneModeName]
  'update:baseLayer': [id: string | null]
  'update:sceneMode': [mode: SceneModeName]
  destroyed: []
}>()

const container = ref<HTMLElement | null>(null)
const context = createCesiumContext()
provide(CESIUM_KIT_CONTEXT_KEY, context)

const manager = shallowRef<CesiumViewerManager | null>(null)
const globalOptions = inject<CesiumKitPluginOptions | null>(CESIUM_KIT_OPTIONS_KEY, null)
let disposers: Array<() => void> = []
let unmounted = false

function disposeListeners(): void {
  for (let i = disposers.length - 1; i >= 0; i -= 1) {
    try {
      disposers[i]?.()
    } catch {
      // 忽略清理异常
    }
  }
  disposers = []
}

async function init(): Promise<CesiumViewerManager | null> {
  if (!container.value || manager.value) return manager.value
  context.reset()

  const merged: CesiumKitOptions = {
    ...globalOptions?.defaultViewerOptions,
    ...props.options,
    ionToken: props.ionToken ?? props.options?.ionToken ?? globalOptions?.ionToken
  }

  try {
    const instance = await CesiumViewerManager.create(container.value, merged)
    if (unmounted) {
      instance.destroy()
      return null
    }

    manager.value = instance
    context.resolve(instance)

    disposers.push(instance.camera.onChange((view) => emit('camera-change', view)))
    disposers.push(
      instance.events.on('imagery:change', ({ id }) => {
        emit('imagery-change', id)
        emit('update:baseLayer', id)
      })
    )
    disposers.push(
      instance.events.on('scene:mode', (mode) => {
        emit('scene-mode', mode)
        emit('update:sceneMode', mode)
      })
    )
    disposers.push(instance.events.on('error', (payload) => emit('error', payload)))

    if (props.baseLayer) instance.imagery.switchTo(props.baseLayer)
    if (props.sceneMode) instance.scene.setMode(props.sceneMode, 0)

    emit('camera-change', instance.camera.getView())
    emit('ready', instance)
    return instance
  } catch (error) {
    context.fail(error)
    emit('error', { source: 'viewer', error })
    return null
  }
}

function destroy(): void {
  disposeListeners()
  manager.value?.destroy()
  manager.value = null
  context.reset()
}

onMounted(() => {
  if (props.autoInit) void init()
})

onBeforeUnmount(() => {
  unmounted = true
  destroy()
  emit('destroyed')
})

watch(
  () => props.baseLayer,
  (id) => {
    if (!manager.value) return
    manager.value.imagery.switchTo(id ?? null)
  }
)

watch(
  () => props.sceneMode,
  (mode) => {
    if (!manager.value || !mode) return
    manager.value.scene.setMode(mode)
  }
)

function getViewer() {
  return manager.value?.getViewer() ?? null
}

function flyHome(duration = 1.5): void {
  manager.value?.camera.flyHome(duration)
}

function setSceneMode(mode: SceneModeName, duration = 1): void {
  manager.value?.scene.setMode(mode, duration)
}

function switchBaseLayer(id: string | null): void {
  manager.value?.imagery.switchTo(id)
}

defineExpose({
  manager,
  whenReady: context.whenReady,
  init,
  destroy,
  getViewer,
  flyHome,
  setSceneMode,
  switchBaseLayer
})
</script>

<template>
  <div ref="container" class="cesium-kit-viewer">
    <slot />
  </div>
</template>

<style scoped>
.cesium-kit-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 1px;
  overflow: hidden;
}
</style>
