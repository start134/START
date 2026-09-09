// 每日自动备份：SQLite 一致快照导出到 data/backups/，保留最近 7 份。
// 触发时机是"懒触发"：文件存储没有后台进程，借助每次 GET /api/posts
// 的访问做按天去重（进程内标记，一天最多写一次）。
import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'
import { backupDb } from '@/lib/db'

const log = createLogger('backup')

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups')
const KEEP_COUNT = 7

const globalForBackup = globalThis as unknown as {
  __startLastBackupDay?: string
}

export async function createBackup(): Promise<string> {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const filePath = path.join(BACKUP_DIR, `backup-${stamp}.db`)

  await fs.mkdir(BACKUP_DIR, { recursive: true })
  // better-sqlite3 backup API：在线热备，WAL 模式下也保证一致快照
  await backupDb(filePath)

  // 只保留最近 KEEP_COUNT 份
  const files = (await fs.readdir(BACKUP_DIR))
    .filter((f) => f.startsWith('backup-') && f.endsWith('.db'))
    .sort()
    .reverse()
  for (const old of files.slice(KEEP_COUNT)) {
    try {
      await fs.unlink(path.join(BACKUP_DIR, old))
    } catch {
      // 删旧失败不影响本次备份
    }
  }

  log.info('自动备份完成', { file: path.basename(filePath) })
  return filePath
}

/** 每天第一次有访问时触发一次备份；失败不抛出（备份是尽力而为） */
export async function maybeRunDailyBackup(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  if (globalForBackup.__startLastBackupDay === today) return
  globalForBackup.__startLastBackupDay = today
  try {
    await createBackup()
  } catch (err) {
    log.warn('自动备份失败（今天不再重试）', { error: String(err) })
  }
}
