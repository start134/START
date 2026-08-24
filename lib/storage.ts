import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'

const log = createLogger('storage')

export type StorageBackend = 'local' | 'vercel'

function getBackend(): StorageBackend {
  // 构建时强制用本地，运行时才用 Vercel
  // NEXT_PHASE 在 Next.js 构建期间为 'build'，运行时为 'runtime'
  if (process.env.NEXT_PHASE === 'build') return 'local'
  return process.env.VERCEL ? 'vercel' : 'local'
}

/** 读取 JSON 文件 */
export async function readJSON<T>(fileName: string): Promise<T | null> {
  const backend = getBackend()

  if (backend === 'vercel') {
    return readFromBlob<T>(fileName)
  }

  // 本地：直接读文件
  const filePath = path.join(process.cwd(), 'data', fileName)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      log.info('本地存储：文件不存在', { fileName })
      return null
    }
    throw err
  }
}

/** 写入 JSON 文件 */
export async function writeJSON(fileName: string, data: unknown): Promise<void> {
  const backend = getBackend()

  if (backend === 'vercel') {
    await writeToBlob(fileName, data)
    return
  }

  // 本地：直接写文件
  const dataDir = path.join(process.cwd(), 'data')
  await fs.mkdir(dataDir, { recursive: true })
  const filePath = path.join(dataDir, fileName)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  log.debug('本地存储：写入成功', { fileName, size: JSON.stringify(data).length })
}

/** 删除文件 */
export async function deleteFile(fileName: string): Promise<void> {
  const backend = getBackend()

  if (backend === 'vercel') {
    await deleteFromBlob(fileName)
    return
  }

  const filePath = path.join(process.cwd(), 'data', fileName)
  try {
    await fs.unlink(filePath)
    log.debug('本地存储：删除成功', { fileName })
  } catch {
    // 文件不存在时忽略
  }
}

// ==================== Vercel Blob 实现 ====================
// 仅在运行时且检测到 Vercel 环境时才加载

// 延迟加载：只在需要时才导入模块
type BlobModule = { get: (key: string) => Promise<{ text: () => Promise<string> } | null>; put: (key: string, body: string, opts?: { contentType?: string }) => Promise<unknown>; del: (key: string) => Promise<unknown> }

let blobModulePromise: Promise<BlobModule | null> | null = null

async function loadBlobModule(): Promise<BlobModule | null> {
  if (blobModulePromise) return blobModulePromise
  blobModulePromise = (async () => {
    try {
      // 用变量存储模块路径，防止静态分析
      const modPath = '@vercel/blob'
      const mod = await import(/* @__PURE__ */ modPath)
      return mod as BlobModule
    } catch (e) {
      log.warn('加载 @vercel/blob 失败：', String(e))
      return null
    }
  })()
  return blobModulePromise
}

async function readFromBlob<T>(fileName: string): Promise<T | null> {
  try {
    const mod = await loadBlobModule()
    if (!mod) {
      log.warn('@vercel/blob 模块不可用，回退到本地存储', { fileName })
      return readFromLocalFallback<T>(fileName)
    }
    const blob = await mod.get(fileName)
    if (!blob) {
      log.info('Vercel Blob：文件不存在', { fileName })
      return null
    }
    const text = await blob.text()
    return JSON.parse(text) as T
  } catch (err: unknown) {
    const errStr = String(err)
    if (errStr.includes('ENOENT') || errStr.includes('not found')) {
      log.info('Vercel Blob：文件不存在', { fileName })
      return null
    }
    log.warn('Vercel Blob：读取失败，回退到本地存储', { fileName, error: errStr })
    return readFromLocalFallback<T>(fileName)
  }
}

async function writeToBlob(fileName: string, data: unknown): Promise<void> {
  try {
    const mod = await loadBlobModule()
    if (!mod) {
      log.warn('@vercel/blob 模块不可用，回退到本地存储', { fileName })
      await writeToLocalFallback(fileName, data)
      return
    }
    const json = JSON.stringify(data, null, 2)
    await mod.put(fileName, json, { contentType: 'application/json' })
    log.debug('Vercel Blob：写入成功', { fileName, size: json.length })
  } catch (err: unknown) {
    const errStr = String(err)
    log.warn('Vercel Blob：写入失败，回退到本地存储', { fileName, error: errStr })
    await writeToLocalFallback(fileName, data)
  }
}

async function deleteFromBlob(fileName: string): Promise<void> {
  try {
    const mod = await loadBlobModule()
    if (!mod) return
    await mod.del(fileName)
    log.debug('Vercel Blob：删除成功', { fileName })
  } catch {
    // 忽略删除错误
  }
}

// ==================== 本地回退 ====================

async function readFromLocalFallback<T>(fileName: string): Promise<T | null> {
  const filePath = path.join(process.cwd(), 'data', fileName)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeToLocalFallback(fileName: string, data: unknown): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data')
  await fs.mkdir(dataDir, { recursive: true })
  const filePath = path.join(dataDir, fileName)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
