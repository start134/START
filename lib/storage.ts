import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'

const log = createLogger('storage')

const DATA_DIR = path.join(process.cwd(), 'data')

export async function readJSON<T>(fileName: string): Promise<T | null> {
  const filePath = path.join(DATA_DIR, fileName)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      log.info('文件不存在，返回 null', { fileName })
      return null
    }
    log.warn('读取文件失败', { fileName, error: String(err) })
    return null
  }
}

export async function writeJSON(fileName: string, data: unknown): Promise<void> {
  const filePath = path.join(DATA_DIR, fileName)
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    log.debug('写入成功', { fileName })
  } catch (err) {
    log.warn('写入失败（可能是只读文件系统）', { fileName, error: String(err) })
  }
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
