// 每日自动备份：把全部 JSON 数据打包到 data/backups/，保留最近 7 份。
// 触发时机是" opportunistic "：文件存储没有后台进程，借助每次 GET /api/posts
// 的访问做懒触发（进程内按天去重，一天最多写一次）。
import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'
import { withFileLock, writeFileAtomic } from '@/lib/storage'
import { readAllPosts } from '@/lib/posts-store'
import { readAllComments } from '@/lib/comments-store'
import { readAllNotifications } from '@/lib/notifications-store'

const log = createLogger('backup')

// Vercel Serverless 文件系统只读（/tmp 除外），部署到 Vercel 时必须用 /tmp/data
const BACKUP_DIR = process.env.VERCEL
  ? '/tmp/data/backups'
  : path.join(process.cwd(), 'data', 'backups')
const BACKUP_LOCK_KEY = 'backup'
const KEEP_COUNT = 7

const globalForBackup = globalThis as unknown as {
  __startLastBackupDay?: string
}

type BackupPayload = {
  exportedAt: string
  posts: unknown
  comments: unknown
  notifications: unknown
  stats: unknown
}

export async function createBackup(): Promise<string> {
  const [posts, comments, notifications, statsRaw] = await Promise.all([
    readAllPosts({ includeDeleted: true }),
    readAllComments(),
    readAllNotifications(),
    fs
      .readFile(
        process.env.VERCEL
          ? '/tmp/data/stats.json'
          : path.join(process.cwd(), 'data', 'stats.json'),
        'utf-8'
      )
      .catch(() => null),
  ])

  let stats: unknown = null
  try {
    stats = statsRaw ? JSON.parse(statsRaw) : null
  } catch {
    stats = null
  }

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const filePath = path.join(BACKUP_DIR, `backup-${stamp}.json`)
  const payload: BackupPayload = {
    exportedAt: now.toISOString(),
    posts,
    comments,
    notifications,
    stats,
  }

  await withFileLock(BACKUP_LOCK_KEY, async () => {
    await fs.mkdir(BACKUP_DIR, { recursive: true })
    await writeFileAtomic(filePath, JSON.stringify(payload, null, 2))
    // 只保留最近 KEEP_COUNT 份
    const files = (await fs.readdir(BACKUP_DIR))
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
    for (const old of files.slice(KEEP_COUNT)) {
      try {
        await fs.unlink(path.join(BACKUP_DIR, old))
      } catch {
        // 删旧失败不影响本次备份
      }
    }
  })

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
