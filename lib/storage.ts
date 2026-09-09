import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'

const log = createLogger('storage')

const DATA_DIR = path.join(process.cwd(), 'data')

// 进程内文件写锁：JSON 数据全部是“读全量 → 改 → 写回全量”，
// 并发写会互相覆盖丢数据，这里按文件名串行化整个读改写事务。
// 锁表挂 globalThis：dev 下 Turbopack 会为 RSC 与 route handler 创建不同模块实例，
// 必须共享同一张锁表。多实例部署需换真正的数据库/存储服务（见 DEPLOYMENT.md）。
const globalForFileLocks = globalThis as unknown as {
  __startFileLocks?: Map<string, Promise<unknown>>
}
const fileLocks =
  globalForFileLocks.__startFileLocks ?? new Map<string, Promise<unknown>>()
if (!globalForFileLocks.__startFileLocks) {
  globalForFileLocks.__startFileLocks = fileLocks
}

export function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  // 锁表里存“吞掉错误”的副本，保证后续排队者不被前一个事务的失败卡死
  fileLocks.set(key, run.then(() => undefined, () => undefined))
  return run
}

// 先写临时文件再 rename，避免并发读到写了一半的 JSON
export async function writeFileAtomic(
  filePath: string,
  data: string
): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.writeFile(tmp, data, 'utf-8')
    await fs.rename(tmp, filePath)
  } catch (err) {
    try {
      await fs.unlink(tmp)
    } catch {
      // 临时文件清理失败不影响主错误
    }
    throw err
  }
}

export async function readJSON<T>(fileName: string): Promise<T | null> {
  const filePath = path.join(DATA_DIR, fileName)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      log.debug('文件不存在，返回 null', { fileName })
      return null
    }
    log.warn('读取文件失败', { fileName, error: String(err) })
    return null
  }
}

// 写入失败会抛错，由调用方决定如何响应（不再静默吞掉导致“看似成功实则丢失”）
export async function writeJSON(fileName: string, data: unknown): Promise<void> {
  const filePath = path.join(DATA_DIR, fileName)
  await fs.mkdir(DATA_DIR, { recursive: true })
  await writeFileAtomic(filePath, JSON.stringify(data, null, 2))
  log.debug('写入成功', { fileName })
}

export async function deleteFile(fileName: string): Promise<void> {
  const filePath = path.join(DATA_DIR, fileName)
  try {
    await fs.unlink(filePath)
    log.debug('删除成功', { fileName })
  } catch {
    // 文件不存在时忽略
  }
}
