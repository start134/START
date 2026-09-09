// 阅读量统计：落盘到本地 data/stats.json。
// 命名沿用早期 KV 方案；生产部署的存储要求见 DEPLOYMENT.md。
import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'
import { withFileLock } from '@/lib/storage'

const log = createLogger('kv-stats')

// Vercel Serverless 文件系统只读（/tmp 除外），部署到 Vercel 时必须用 /tmp/data
const LOCAL_FILE = process.env.VERCEL
  ? '/tmp/data/stats.json'
  : path.join(process.cwd(), 'data', 'stats.json')
const STATS_LOCK_KEY = 'stats.json'

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

type StatsData = {
  daily: Record<string, number>
  total: number
  /** 单篇每日阅读量：{ [date]: { [slug]: count } }，保存时只保留最近 90 天 */
  bySlug?: Record<string, Record<string, number>>
}

/** 单篇统计保留窗口（与 stats API 的 90 天上限一致） */
const BY_SLUG_RETENTION_DAYS = 90

async function loadLocalStats(): Promise<StatsData> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, 'utf-8')
    const data = JSON.parse(raw) as {
      daily?: { date: string; views: number }[]
      totalViews?: number
      bySlug?: Record<string, Record<string, number>>
    }
    return {
      daily: Object.fromEntries(
        (data.daily ?? []).map((d) => [d.date, d.views])
      ),
      total: data.totalViews ?? 0,
      bySlug: data.bySlug ?? {},
    }
  } catch {
    // 文件不存在或损坏：从零开始（读取路径的容错降级）
    return { daily: {}, total: 0 }
  }
}

function pruneBySlug(bySlug: Record<string, Record<string, number>>): void {
  const cutoff = getDateNDaysAgo(BY_SLUG_RETENTION_DAYS - 1)
  for (const date of Object.keys(bySlug)) {
    if (date < cutoff) delete bySlug[date]
  }
}

async function saveLocalStats(stats: StatsData): Promise<void> {
  const daily = Object.entries(stats.daily).map(([date, views]) => ({ date, views }))
  if (stats.bySlug) pruneBySlug(stats.bySlug)
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
  await fs.writeFile(
    LOCAL_FILE,
    JSON.stringify(
      {
        daily,
        totalViews: stats.total,
        bySlug: stats.bySlug && Object.keys(stats.bySlug).length > 0 ? stats.bySlug : undefined,
        lastUpdated: today(),
      },
      null,
      2
    ),
    'utf-8'
  )
}

export async function incrementTodayViews(slug?: string): Promise<void> {
  await withFileLock(STATS_LOCK_KEY, async () => {
    const stats = await loadLocalStats()
    const date = today()
    const prevViews = stats.daily[date] || 0
    stats.daily[date] = prevViews + 1
    stats.total += 1
    if (slug) {
      if (!stats.bySlug) stats.bySlug = {}
      if (!stats.bySlug[date]) stats.bySlug[date] = {}
      stats.bySlug[date][slug] = (stats.bySlug[date][slug] || 0) + 1
    }
    await saveLocalStats(stats)
    log.debug('阅读量统计 +1', { date, slug, newViews: stats.daily[date], newTotal: stats.total })
  })
}

export async function getDailyStats(days: number = 30): Promise<{ date: string; views: number }[]> {
  const stats = await loadLocalStats()
  const result: { date: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = getDateNDaysAgo(i)
    result.push({ date, views: stats.daily[date] || 0 })
  }
  log.debug('查询每日统计', { days, dataPoints: result.length, total: stats.total })
  return result
}

export async function getTotalViews(): Promise<number> {
  const stats = await loadLocalStats()
  return stats.total
}

/** 单篇文章的每日阅读量序列（最近 N 天，用于管理端趋势图） */
export async function getArticleDailyStats(
  slug: string,
  days: number = 30
): Promise<{ date: string; views: number }[]> {
  const stats = await loadLocalStats()
  const result: { date: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = getDateNDaysAgo(i)
    result.push({ date, views: stats.bySlug?.[date]?.[slug] || 0 })
  }
  return result
}
