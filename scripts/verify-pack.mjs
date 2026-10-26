import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const PACKAGES = ['core', 'vue', 'weather', 'wind', 'vite']

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (result.status !== 0) {
    throw new Error(`命令失败：${command} ${args.join(' ')}（cwd: ${cwd}）`)
  }
}

function tarballPath(packDir, name) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'))
  return path.join(packDir, `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`)
}

function toFileUrl(file) {
  return `file:${file.replace(/\\/g, '/')}`
}

// Windows + Node 22 下 fs.cpSync 会触发 0xC0000409，这里用最基础的 API 递归复制
function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else if (entry.isFile()) copyFileSync(from, to)
  }
}

const workDir = keep
  ? path.join(root, '.verify-pack-tmp')
  : mkdtempSync(path.join(tmpdir(), 'cesium-kit-pack-'))
const packDir = path.join(workDir, 'packs')
const appDir = path.join(workDir, 'app')

let failed = false
try {
  for (const name of PACKAGES) {
    const dist = path.join(root, 'packages', name, 'dist', 'index.js')
    if (!existsSync(dist)) {
      throw new Error(`缺少构建产物：${dist}，请先执行 pnpm build`)
    }
  }

  copyDir(path.join(root, 'fixtures', 'consumer'), appDir)

  console.log(`[verify-pack] 打包到 ${packDir}`)
  for (const name of PACKAGES) {
    run('pnpm', ['--filter', `./packages/${name}`, 'pack', '--pack-destination', packDir], root)
  }

  const versions = { 'vue': '^3.5.44', 'vite': '^8.3.4', 'typescript': '^6.0.3' }
  const fixturePkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'))
  fixturePkg.dependencies = {
    '@sgyx/cesium-kit-core': toFileUrl(tarballPath(packDir, 'core')),
    '@sgyx/cesium-kit-vue': toFileUrl(tarballPath(packDir, 'vue')),
    '@sgyx/cesium-kit-weather': toFileUrl(tarballPath(packDir, 'weather')),
    '@sgyx/cesium-kit-wind': toFileUrl(tarballPath(packDir, 'wind')),
    '@sgyx/cesium-kit-vite': toFileUrl(tarballPath(packDir, 'vite')),
    cesium: '^1.146.0',
    vue: versions.vue
  }
  fixturePkg.devDependencies = {
    '@vitejs/plugin-vue': '^6.0.10',
    typescript: versions.typescript,
    'vite': versions.vite,
    'vue-tsc': '^3.1.1'
  }
  writeFileSync(
    path.join(appDir, 'package.json'),
    `${JSON.stringify(fixturePkg, null, 2)}\n`,
    'utf8'
  )
  writeFileSync(path.join(appDir, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022', 'DOM'],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      jsx: 'preserve',
      types: ['vite/client']
    },
    include: ['src/**/*.ts', 'src/**/*.vue', 'vite.config.ts']
  }, null, 2)}\n`, 'utf8')

  console.log('[verify-pack] 安装 tarball 依赖')
  run('npm', ['install', '--no-audit', '--no-fund'], appDir)

  console.log('[verify-pack] 类型检查')
  run('npx', ['vue-tsc', '--noEmit'], appDir)

  console.log('[verify-pack] 构建')
  run('npx', ['vite', 'build'], appDir)

  const mustExist = [
    'dist/index.html',
    'dist/cesium/Workers/transferTypedArrayTest.js',
    'dist/cesium/Assets/Textures/NaturalEarthII/tilemapresource.xml',
    'dist/cesium/Widgets/widgets.css',
    'dist/cesium/ThirdParty'
  ]
  const missing = mustExist.filter((file) => !existsSync(path.join(appDir, file)))
  if (missing.length) {
    throw new Error(`构建产物缺失：\n  ${missing.join('\n  ')}`)
  }

  console.log('[verify-pack] 通过：tarball 安装、类型、构建、静态资源均正常')
} catch (error) {
  failed = true
  console.error(`[verify-pack] 失败：${error.message}`)
  if (keep) console.error(`[verify-pack] 已保留现场：${workDir}`)
} finally {
  if (!keep && !failed) rmSync(workDir, { recursive: true, force: true })
  if (!keep && failed) console.error(`[verify-pack] 保留现场用于排查：${workDir}`)
}

process.exit(failed ? 1 : 0)
