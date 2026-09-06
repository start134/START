// 阅读量统计：落盘到本地 data/stats.json。
// 命名沿用早期 KV 方案；生产部署的存储要求见 DEPLOYMENT.md。
import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'
import { withFileLock } from '@/lib/storage'

const log = createLogger('kv-stats')

const LOCAL_FILE = path.join(process.cwd(), 'data', 'stats.json')
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

type StatsData = { daily: Record<string, number>; total: number }

async function loadLocalStats(): Promise<StatsData> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, 'utf-8')
    const data = JSON.parse(raw) as {
      daily?: { date: string; views: number }[]
      totalViews?: number
    }
    return {
      daily: Object.fromEntries(
        (data.daily ?? []).map((d) => [d.date, d.views])
      ),
      total: data.totalViews ?? 0,
    }
  } catch {
    // 文件不存在或损坏：从零开始（读取路径的容错降级）
    return { daily: {}, total: 0 }
  }
}

async function saveLocalStats(stats: StatsData): Promise<void> {
  const daily = Object.entries(stats.daily).map(([date, views]) => ({ date, views }))
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
  await fs.writeFile(
    LOCAL_FILE,
    JSON.stringify({ daily, totalViews: stats.total, lastUpdated: today() }, null, 2),
    'utf-8'
  )
}

export async function incrementTodayViews(): Promise<void> {
  await withFileLock(STATS_LOCK_KEY, async () => {
    const stats = await loadLocalStats()
    const date = today()
    const prevViews = stats.daily[date] || 0
    stats.daily[date] = prevViews + 1
    stats.total += 1
    await saveLocalStats(stats)
    log.debug('阅读量统计 +1', { date, newViews: stats.daily[date], newTotal: stats.total })
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
