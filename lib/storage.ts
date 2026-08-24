import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'

const log = createLogger('storage')

export type StorageBackend = 'local' | 'vercel'

function getBackend(): StorageBackend {
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
// 仅在 Vercel 环境下动态导入，本地开发时不会加载

async function readFromBlob<T>(fileName: string): Promise<T | null> {
  try {
    const { get } = await import('@vercel/blob')
    const blob = await get(fileName)
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
    // @vercel/blob 未安装（本地开发），回退到本地存储
    if (errStr.includes('Cannot find module') || errStr.includes('module not found')) {
      log.warn('@vercel/blob 未安装，回退到本地存储', { fileName })
      return readFromLocalFallback<T>(fileName)
    }
    log.error('Vercel Blob：读取失败', { fileName, error: errStr })
    throw err
  }
}

async function writeToBlob(fileName: string, data: unknown): Promise<void> {
  try {
    const { put } = await import('@vercel/blob')
    const json = JSON.stringify(data, null, 2)
    await put(fileName, json, { contentType: 'application/json' })
    log.debug('Vercel Blob：写入成功', { fileName, size: json.length })
  } catch (err: unknown) {
    const errStr = String(err)
    if (errStr.includes('Cannot find module') || errStr.includes('module not found')) {
      log.warn('@vercel/blob 未安装，回退到本地存储', { fileName })
      await writeToLocalFallback(fileName, data)
      return
    }
    log.error('Vercel Blob：写入失败', { fileName, error: errStr })
    throw err
  }
}

async function deleteFromBlob(fileName: string): Promise<void> {
  try {
    const { del } = await import('@vercel/blob')
    await del(fileName)
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
