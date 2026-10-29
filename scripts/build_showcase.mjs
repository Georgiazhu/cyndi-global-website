#!/usr/bin/env node
/**
 * 集成构建：拉取 HRT/showcase，构建后合入主站 dist/showcase/
 *
 * 设计要点：
 * 1. showcase 是独立仓库（选品内容在那边维护），主站只负责承载产物。
 * 2. 拉取/构建失败不阻断主站构建 —— 沿用上一版产物，避免整站挂掉。
 * 3. showcase 的 base 必须是 /showcase/，产物内部是相对路径，拷贝到 dist/showcase/ 即可直接访问。
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUT_DIR = join(REPO_ROOT, 'product-showcase', 'dist', 'showcase')
const TMP_DIR = join(REPO_ROOT, '.tmp-showcase-build')
const SHOWCASE_REPO = process.env.SHOWCASE_REPO_URL || 'https://github.com/HRT/showcase.git'
const BRANCH = process.env.SHOWCASE_BRANCH || 'main'

const log = (...a) => console.log('[showcase]', ...a)

function run(cmd, cwd, opts = {}) {
  return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8', ...opts })
}

function safeRun(cmd, cwd) {
  try {
    return { ok: true, out: run(cmd, cwd) }
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') }
  }
}

function main() {
  // 1. 拉取 showcase 仓库
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(TMP_DIR, { recursive: true })

  const clone = safeRun(
    `git clone --depth 1 --branch ${BRANCH} ${SHOWCASE_REPO} .`,
    TMP_DIR,
  )
  if (!clone.ok) {
    log('拉取 showcase 仓库失败，跳过本次集成（沿用上一版产物）')
    log(clone.out.slice(0, 400))
    return
  }
  log(`已拉取 showcase @ ${BRANCH}`)

  // 2. 安装依赖并构建
  const install = safeRun('npm ci --no-audit --no-fund', TMP_DIR)
  if (!install.ok) {
    const fallback = safeRun('npm install --no-audit --no-fund', TMP_DIR)
    if (!fallback.ok) {
      log('依赖安装失败，跳过本次集成（沿用上一版产物）')
      log(fallback.out.slice(0, 400))
      return
    }
  }

  const build = safeRun('npm run build', TMP_DIR)
  if (!build.ok) {
    log('构建 showcase 失败，跳过本次集成（沿用上一版产物）')
    log(build.out.slice(0, 400))
    return
  }

  const dist = join(TMP_DIR, 'dist')
  if (!existsSync(join(dist, 'index.html'))) {
    log('showcase 产物缺少 index.html，跳过本次集成')
    return
  }

  // 3. 合入主站 dist/showcase/
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  cpSync(dist, OUT_DIR, { recursive: true })
  log(`已合入 ${OUT_DIR}`)

  const files = readdirSync(OUT_DIR, { recursive: true }).filter((f) => typeof f === 'string')
  log(`产物文件数: ${files.length}`)

  // 4. 清理临时目录
  rmSync(TMP_DIR, { recursive: true, force: true })
}

main()
