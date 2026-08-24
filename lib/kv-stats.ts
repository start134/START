import { createLogger } from '@/lib/logger'
import fs from 'node:fs'
import path from 'node:path'

const log = createLogger('kv-stats')

const LOCAL_FILE = path.join(process.cwd(), 'data', 'stats.json')

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

function loadLocalStats(): { daily: Record<string, number>; total: number } {
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const raw = fs.readFileSync(LOCAL_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return {
        daily: Object.fromEntries(
          (data.daily || []).map((d: { date: string; views: number }) => [d.date, d.views])
        ),
        total: data.totalViews || 0,
      }
    }
  } catch {
    // 忽略
  }
  return { daily: {}, total: 0 }
}

function saveLocalStats(stats: { daily: Record<string, number>; total: number }): void {
  try {
    const dataDir = path.dirname(LOCAL_FILE)
    fs.mkdirSync(dataDir, { recursive: true })
    const daily = Object.entries(stats.daily).map(([date, views]) => ({ date, views }))
    fs.writeFileSync(
      LOCAL_FILE,
      JSON.stringify({ daily, totalViews: stats.total, lastUpdated: today() }, null, 2),
      'utf-8'
    )
  } catch {
    // 只读文件系统时忽略
  }
}

export async function incrementTodayViews(): Promise<void> {
  const stats = loadLocalStats()
  const date = today()
  const prevViews = stats.daily[date] || 0
  stats.daily[date] = prevViews + 1
  stats.total += 1
  saveLocalStats(stats)
  log.info('阅读量 +1', { date, prevViews, newViews: stats.daily[date], newTotal: stats.total })
}

export async function getDailyStats(days: number = 30): Promise<{ date: string; views: number }[]> {
  const stats = loadLocalStats()
  const result: { date: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = getDateNDaysAgo(i)
    result.push({ date, views: stats.daily[date] || 0 })
  }
  log.info('查询每日统计', { days, dataPoints: result.length, total: stats.total })
  return result
}

export async function getTotalViews(): Promise<number> {
  const stats = loadLocalStats()
  return stats.total
}
