<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { PopupHandle, PositionInput } from '@sgyx/cesium-kit-core'
import { usePopup } from '../composables/usePopup'

defineOptions({ name: 'CesiumPopup' })

const props = withDefaults(
  defineProps<{
    visible?: boolean
    position?: PositionInput | null
    title?: string
    offset?: [number, number]
    closable?: boolean
    showAnchor?: boolean
    className?: string
  }>(),
  {
    visible: false,
    position: null,
    closable: true,
    showAnchor: true
  }
)

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  open: []
  close: []
}>()

const host = shallowRef<HTMLElement | null>(null)
let handle: PopupHandle | null = null
let closing = false
let disposed = false

onBeforeUnmount(() => {
  disposed = true
  closePopup()
})

const { open } = usePopup()

async function openPopup(): Promise<void> {
  if (disposed || handle || !props.position) return
  const element = document.createElement('div')
  document.body.appendChild(element)
  host.value = element
  const created = await open({
    position: props.position,
    title: props.title,
    offset: props.offset,
    closable: props.closable,
    showAnchor: props.showAnchor,
    className: props.className,
    content: element,
    onClose: () => {
      if (closing || disposed) return
      closing = true
      handle = null
      host.value = null
      closing = false
      emit('update:visible', false)
      emit('close')
    }
  })
  if (!created) {
    element.remove()
    host.value = null
    return
  }
  if (disposed || !props.visible) {
    created.close()
    element.remove()
    host.value = null
    return
  }
  handle = created
  emit('open')
}

function closePopup(): void {
  if (!handle) return
  const current = handle
  handle = null
  host.value = null
  closing = true
  current.close()
  closing = false
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void openPopup()
    else closePopup()
  },
  { immediate: true }
)

watch(
  () => props.position,
  (position) => {
    if (!position) return
    if (handle) handle.setPosition(position)
    else if (props.visible) void openPopup()
  }
)

watch(
  () => props.title,
  (title) => {
    if (title !== undefined && handle) handle.setTitle(title)
  }
)

</script>

<template>
  <Teleport v-if="host" :to="host">
    <slot />
  </Teleport>
</template>
