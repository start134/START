// 阅读统计（SQLite stats_daily 表）：slug='' 为全站汇总，其余为单篇。
// 写入由 posts-store.incrementRead 在同一事务内完成，这里只提供读取。
import { createLogger } from '@/lib/logger'
import { db } from '@/lib/db'

const log = createLogger('kv-stats')

function getDateNDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

export async function getDailyStats(days: number = 30): Promise<{ date: string; views: number }[]> {
  const from = getDateNDaysAgo(days - 1)
  const rows = db()
    .prepare("SELECT date, views FROM stats_daily WHERE slug = '' AND date >= ? ORDER BY date ASC")
    .all(from) as { date: string; views: number }[]
  const byDate = new Map(rows.map((r) => [r.date, r.views]))
  const result: { date: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = getDateNDaysAgo(i)
    result.push({ date, views: byDate.get(date) ?? 0 })
  }
  return result
}

export async function getTotalViews(): Promise<number> {
  const row = db().prepare("SELECT value FROM kv WHERE key = 'total_views'").get() as
    | { value: string }
    | undefined
  return row ? Number(row.value) || 0 : 0
}

/** 单篇文章的每日阅读量序列（最近 N 天，用于管理端趋势图） */
export async function getArticleDailyStats(
  slug: string,
  days: number = 30
): Promise<{ date: string; views: number }[]> {
  const from = getDateNDaysAgo(days - 1)
  const rows = db()
    .prepare('SELECT date, views FROM stats_daily WHERE slug = ? AND date >= ? ORDER BY date ASC')
    .all(slug, from) as { date: string; views: number }[]
  const byDate = new Map(rows.map((r) => [r.date, r.views]))
  const result: { date: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = getDateNDaysAgo(i)
    result.push({ date, views: byDate.get(date) ?? 0 })
  }
  return result
}
