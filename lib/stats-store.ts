import { getDb } from '@/lib/db'
import { createLogger } from '@/lib/logger'

const log = createLogger('stats-store')

export type DailyStat = {
  date: string
  views: number
}

function today(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function getDateNDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

/** 原子 +1 今日阅读量（O(1) 单行 UPSERT） */
export async function incrementTodayViews(): Promise<void> {
  const db = getDb()
  const date = today()
  const now = new Date().toISOString()

  // 获取当前值用于日志
  const existing = db
    .prepare('SELECT views FROM daily_stats WHERE date = ?')
    .get(date) as { views: number } | null

  const prevViews = existing?.views ?? 0
  const newViews = prevViews + 1

  // UPSERT：INSERT ... ON CONFLICT DO UPDATE
  db.prepare(`
    INSERT INTO daily_stats (date, views, created_at, updated_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      views = views + 1,
      updated_at = excluded.updated_at
  `).run(date, now, now)

  // 更新总阅读量（存入 meta 表）
  const totalRow = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('total_views') as { value: string } | null
  const prevTotal = totalRow ? parseInt(totalRow.value, 10) || 0 : 0
  const newTotal = prevTotal + 1

  db.prepare(`
    INSERT INTO meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run('total_views', String(newTotal), now)

  log.info('阅读量 +1', {
    date,
    prevViews,
    newViews,
    prevTotal,
    newTotal,
    operation: existing ? 'update' : 'insert',
  })
}

/** 查询指定天数的每日统计（服务端预聚合） */
export async function getDailyStats(days: number = 30): Promise<DailyStat[]> {
  const db = getDb()
  const startDate = getDateNDaysAgo(days - 1)

  // 从数据库直接聚合查询
  const rows = db
    .prepare(`
      SELECT date, views
      FROM daily_stats
      WHERE date >= ?
      ORDER BY date ASC
    `)
    .all(startDate) as { date: string; views: number }[]

  // 构造完整日期范围（包括 views=0 的日期）
  const dataMap = new Map(rows.map((r) => [r.date, r.views]))
  const result: DailyStat[] = []
  let hitCount = 0
  let missCount = 0

  for (let i = days - 1; i >= 0; i--) {
    const date = getDateNDaysAgo(i)
    const views = dataMap.get(date) ?? 0
    if (dataMap.has(date)) hitCount++
    else missCount++
    result.push({ date, views })
  }

  const totalInRange = result.reduce((sum, d) => sum + d.views, 0)

  log.info('查询每日统计', {
    requestedDays: days,
    actualDays: result.length,
    hitCount,
    missCount,
    totalInRange,
    dateRange: `${result[0]?.date} ~ ${result[result.length - 1]?.date}`,
    dbRows: rows.length,
  })

  return result
}

/** 获取总阅读量 */
export async function getTotalViews(): Promise<number> {
  const db = getDb()
  const row = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('total_views') as { value: string } | null
  const total = row ? parseInt(row.value, 10) || 0 : 0
  log.debug('查询总阅读量', { totalViews: total })
  return total
}

/** 清理超过 N 天的旧数据 */
export async function pruneOldData(olderThanDays: number = 90): Promise<number> {
  const db = getDb()
  const cutoffDate = getDateNDaysAgo(olderThanDays)

  const result = db
    .prepare('DELETE FROM daily_stats WHERE date < ?')
    .run(cutoffDate)

  const pruned = result.changes ?? 0
  if (pruned > 0) {
    log.info('清理过期统计数据', {
      cutoffDate,
      prunedCount: pruned,
    })
  }
  return pruned
}

/** 批量插入（用于数据迁移） */
export async function bulkInsert(stats: DailyStat[]): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()

  const insertStmt = db.prepare(`
    INSERT INTO daily_stats (date, views, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      views = excluded.views,
      updated_at = excluded.updated_at
  `)

  const totalViews = stats.reduce((sum, s) => sum + s.views, 0)

  db.exec('BEGIN')
  try {
    for (const row of stats) {
      insertStmt.run(row.date, row.views, now, now)
    }
    // 更新总阅读量
    const existingTotal = db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get('total_views') as { value: string } | null
    const currentTotal = existingTotal ? parseInt(existingTotal.value, 10) || 0 : 0
    db.exec('COMMIT')

    db.prepare(`
      INSERT INTO meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run('total_views', String(Math.max(currentTotal, totalViews)), now)
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  log.info('批量插入统计数据完成', {
    rowsInserted: stats.length,
    totalViews,
  })
}
