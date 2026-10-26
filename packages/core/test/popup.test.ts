import * as Cesium from 'cesium'
import { describe, expect, it } from 'vitest'
import { PopupService } from '../src/popup/PopupService'

function createHarness() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let render: () => void = () => undefined
  const viewer = {
    container: host,
    scene: {
      canvas: { clientWidth: 800, clientHeight: 600, width: 800, height: 600 },
      postRender: new Cesium.Event(),
      mode: Cesium.SceneMode.SCENE2D,
      globe: {}
    },
    camera: { positionWC: Cesium.Cartesian3.ZERO },
    isDestroyed: () => false
  } as unknown as Cesium.Viewer

  let projected: { x: number; y: number; visible?: boolean } = {
    x: 10,
    y: 20,
    visible: true
  }
  const service = new PopupService(viewer, {
    project: () => projected,
    scheduler: {
      add: (callback) => {
        render = callback
        return () => undefined
      }
    }
  })

  return {
    host,
    service,
    viewer,
    render: () => render(),
    setProjection: (value: { x: number; y: number; visible?: boolean }) => {
      projected = value
    }
  }
}

describe('PopupService', () => {
  it('打开弹窗并按投影结果定位', () => {
    const { host, service } = createHarness()
    const handle = service.open({
      position: { lon: 0, lat: 0 },
      title: '城市',
      content: '<b>北京</b>',
      offset: [2, -2]
    })

    const element = host.querySelector('.cesium-kit-popup') as HTMLElement
    expect(element).toBeTruthy()
    expect(element.style.display).toBe('block')
    expect(element.style.left).toBe('12px')
    expect(element.style.top).toBe('18px')
    expect(element.textContent).toContain('城市')
    expect(element.innerHTML).toContain('北京')
    expect(handle.isOpen).toBe(true)

    service.destroy()
    host.remove()
  })

  it('支持更新内容、标题与位置', () => {
    const { service, setProjection } = createHarness()
    const handle = service.open({ position: { lon: 0, lat: 0 }, content: 'A' })

    handle.setContent('B')
    handle.setTitle('标题')
    setProjection({ x: 100, y: 200, visible: true })
    handle.setPosition({ lon: 1, lat: 1 })

    expect(handle.element.textContent).toContain('B')
    expect(handle.element.textContent).toContain('标题')
    expect(handle.element.style.left).toBe('100px')
    expect(handle.element.style.top).toBe('188px')
    service.destroy()
  })

  it('投影不可见时隐藏弹窗', () => {
    const { service, setProjection, render } = createHarness()
    const handle = service.open({ position: { lon: 0, lat: 0 } })
    setProjection({ x: 10, y: 20, visible: false })
    render()
    expect(handle.element.style.display).toBe('none')
    service.destroy()
  })

  it('作用域关闭自己打开的弹窗', () => {
    const { service } = createHarness()
    const scope = service.createScope()
    scope.open({ position: { lon: 0, lat: 0 } })
    scope.open({ position: { lon: 1, lat: 1 } })
    expect(scope.size).toBe(2)
    expect(service.size).toBe(2)

    scope.dispose()
    expect(scope.size).toBe(0)
    expect(service.size).toBe(0)
    service.destroy()
  })

  it('关闭按钮与 closeAll 可清理 DOM', () => {
    const { host, service } = createHarness()
    service.open({ position: { lon: 0, lat: 0 }, content: 'A' })
    service.open({ position: { lon: 1, lat: 1 }, content: 'B' })

    const buttons = host.querySelectorAll('.cesium-kit-popup button')
    expect(buttons).toHaveLength(2)
    ;(buttons[0] as HTMLButtonElement).click()
    expect(service.size).toBe(1)

    service.closeAll()
    expect(host.querySelectorAll('.cesium-kit-popup')).toHaveLength(0)
    service.destroy()
  })
})
