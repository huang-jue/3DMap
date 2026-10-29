import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('records eager/lazy transfers and synchronous/worker raster baselines', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const frames = 24, width = 361, height = 181
  const bytes = Buffer.from(new Float32Array(width * height).fill(12).buffer)
  const transfers = { eager: 0, lazy: 0 }
  await page.route('**/benchmark/**', route => {
    const url = new URL(route.request().url())
    const strategy = url.pathname.includes('/eager/') ? 'eager' : 'lazy'
    if (url.pathname.endsWith('.json')) return route.fulfill({ contentType:'application/json', body:JSON.stringify({ format:'earth-scalar-f32-v1', legend:{min:0,max:20,unit:'C'}, frames:Array.from({length:frames},(_,i) => ({ time:new Date(Date.UTC(2026,0,1,i)).toISOString(),width,height,bounds:{west:-180,south:-90,east:180,north:90},binary:`${i}.f32` })) }) })
    transfers[strategy]++
    return route.fulfill({contentType:'application/octet-stream',body:bytes})
  })
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__cesiumKit), undefined, { timeout:100_000 })
  const root = resolve('.').replaceAll('\\','/')
  const result = await page.evaluate(async ({root,width,height}) => {
    const loading = await import(/* @vite-ignore */ `/@fs/${root}/packages/earth/src/data/loadEarthData.ts`)
    const start = performance.now()
    const eager = await loading.loadEarthScalarData('/benchmark/eager/catalog.json')
    const eagerMs = performance.now()-start
    const lazyStart = performance.now()
    const lazy = await loading.openEarthScalarSource('/benchmark/lazy/catalog.json')
    await Promise.all([11,12,13].map(index => lazy.getFrame(index)))
    const lazyMs = performance.now()-lazyStart
    const pixels = await import(/* @vite-ignore */ `/@fs/${root}/packages/earth/src/layers/rasterPixels.ts`)
    const {RasterRenderer} = await import(/* @vite-ignore */ `/@fs/${root}/packages/earth/src/layers/RasterRenderer.ts`)
    const colors = new Uint8ClampedArray(4096*4); colors.fill(255)
    const job = {width,height,targetWidth:width*4,targetHeight:height*4,values:new Float32Array(width*height).fill(12),colors,min:0,max:20,log:false,smooth:true}
    const baselineStart = performance.now()
    const source = document.createElement('canvas'); source.width=width;source.height=height
    const context = source.getContext('2d')!, image = context.createImageData(width,height)
    pixels.paintRows(job,image.data,0,height);context.putImageData(image,0,0)
    const target = document.createElement('canvas');target.width=job.targetWidth;target.height=job.targetHeight
    target.getContext('2d')!.drawImage(source,0,0,target.width,target.height);target.toDataURL('image/png')
    const synchronousMs = performance.now()-baselineStart
    const renderer = new RasterRenderer(), workerStart=performance.now()
    let ticks=0
    const interval = setInterval(() => ticks++,0)
    const url = await renderer.render(job)
    clearInterval(interval)
    const workerElapsedMs=performance.now()-workerStart
    URL.revokeObjectURL(url);renderer.destroy()
    return {eagerMs,lazyMs,eagerFrames:eager.frames.length, frameBytes:width*height*4,synchronousMs,workerElapsedMs,mainThreadYieldCount:ticks}
  },{root,width,height})
  expect(transfers).toEqual({eager:24,lazy:3})
  expect(result.eagerFrames).toBe(24)
  const report = { ...result, transfers, eagerDecodedBytes:result.frameBytes*24,lazyDecodedBytes:result.frameBytes*3, note:'Eager API models the former all-frame loading strategy. Timing is observational under Chromium SwiftShader, without a pass/fail latency threshold.' }
  await testInfo.attach('performance-baseline.json',{body:JSON.stringify(report,null,2),contentType:'application/json'})
  const { writeFile } = await import('node:fs/promises')
  await writeFile('test-results/performance-baseline.json',JSON.stringify(report,null,2))
})
