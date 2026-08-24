import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'

const log = createLogger('storage')

export type StorageBackend = 'local' | 'vercel'

// 构建阶段（phase-production-build）强制用本地，运行时才用 Vercel
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

function getBackend(): StorageBackend {
  if (isBuildPhase()) return 'local'
  return process.env.VERCEL ? 'vercel' : 'local'
}

/** 读取 JSON 文件 */
export async function readJSON<T>(fileName: string): Promise<T | null> {
  const backend = getBackend()

  if (backend === 'vercel') {
    return readFromBlob<T>(fileName)
  }

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

// ==================== Vercel Blob REST API 实现 ====================
// 不用 @vercel/blob SDK，直接用 fetch 调 REST API，彻底避开构建工具分析

function getBlobBaseUrl(): string | null {
  const url = process.env.BLOB_STORE_URL
  if (!url) return null
  return url.replace(/\/$/, '')
}

async function readFromBlob<T>(fileName: string): Promise<T | null> {
  try {
    const baseUrl = getBlobBaseUrl()
    if (!baseUrl) {
      log.warn('BLOB_STORE_URL 未配置，回退到本地存储', { fileName })
      return readFromLocalFallback<T>(fileName)
    }
    const res = await fetch(`${baseUrl}/${fileName}`, { cache: 'no-store' })
    if (res.status === 404) {
      log.info('Vercel Blob：文件不存在', { fileName })
      return null
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const text = await res.text()
    return JSON.parse(text) as T
  } catch (err: unknown) {
    log.warn('Vercel Blob：读取失败，回退到本地存储', { fileName, error: String(err) })
    return readFromLocalFallback<T>(fileName)
  }
}

async function writeToBlob(fileName: string, data: unknown): Promise<void> {
  try {
    const baseUrl = getBlobBaseUrl()
    if (!baseUrl) {
      log.warn('BLOB_STORE_URL 未配置，回退到本地存储', { fileName })
      await writeToLocalFallback(fileName, data)
      return
    }
    const json = JSON.stringify(data, null, 2)
    const res = await fetch(`${baseUrl}/${fileName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    log.debug('Vercel Blob：写入成功', { fileName, size: json.length })
  } catch (err: unknown) {
    log.warn('Vercel Blob：写入失败，回退到本地存储', { fileName, error: String(err) })
    await writeToLocalFallback(fileName, data)
  }
}

async function deleteFromBlob(fileName: string): Promise<void> {
  try {
    const baseUrl = getBlobBaseUrl()
    if (!baseUrl) return
    await fetch(`${baseUrl}/${fileName}`, { method: 'DELETE' })
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
