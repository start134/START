import { createLogger } from '@/lib/logger'
import fs from 'node:fs'
import path from 'node:path'

const log = createLogger('kv-stats')

const STATS_KEY = 'daily_stats'
const TOTAL_KEY = 'total_views'
const LOCAL_FILE = path.join(process.cwd(), 'data', 'stats.json')

function isVercel(): boolean {
  return process.env.VERCEL === '1' || !!process.env.KV_REST_API_URL
}

/** 获取今日日期字符串 YYYY.MM.DD */
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

// ==================== Vercel KV 实现 ====================

async function kvGetStats(): Promise<{ daily: Record<string, number>; total: number }> {
  try {
    const { kv } = await import('@vercel/kv')
    const [dailyStr, totalStr] = await kv.mget(STATS_KEY, TOTAL_KEY) as [string | null, string | null]
    const daily = dailyStr ? JSON.parse(dailyStr) : {}
    const total = totalStr ? parseInt(totalStr, 10) || 0 : 0
    return { daily, total }
  } catch (err: unknown) {
    const errStr = String(err)
    if (errStr.includes('Cannot find module') || errStr.includes('module not found')) {
      log.warn('@vercel/kv 未安装，回退到本地存储')
      return loadLocalStats()
    }
    throw err
  }
}

async function kvSetStats(daily: Record<string, number>, total: number): Promise<void> {
  try {
    const { kv } = await import('@vercel/kv')
    await kv.set(STATS_KEY, JSON.stringify(daily))
    await kv.set(TOTAL_KEY, String(total))
  } catch (err: unknown) {
    const errStr = String(err)
    if (errStr.includes('Cannot find module') || errStr.includes('module not found')) {
      log.warn('@vercel/kv 未安装，回退到本地存储')
      saveLocalStats({ daily, total })
      return
    }
    throw err
  }
}

// ==================== 本地文件回退 ====================

function loadLocalStats(): { daily: Record<string, number>; total: number } {
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const raw = fs.readFileSync(LOCAL_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return {
        daily: Object.fromEntries((data.daily || []).map((d: { date: string; views: number }) => [d.date, d.views])),
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
    // 忽略
  }
}

// ==================== 公共 API ====================

/** 原子 +1 今日阅读量 */
export async function incrementTodayViews(): Promise<void> {
  if (isVercel()) {
    const { daily, total } = await kvGetStats()
    const date = today()
    const prevViews = daily[date] || 0
    daily[date] = prevViews + 1
    const newTotal = total + 1
    await kvSetStats(daily, newTotal)
    log.info('阅读量 +1 (KV)', { date, prevViews, newViews: daily[date], prevTotal: total, newTotal })
  } else {
    const stats = loadLocalStats()
    const date = today()
    const prevViews = stats.daily[date] || 0
    stats.daily[date] = prevViews + 1
    stats.total += 1
    saveLocalStats(stats)
    log.info('阅读量 +1 (本地)', { date, prevViews, newViews: stats.daily[date], newTotal: stats.total })
  }
}

/** 获取每日统计 */
export async function getDailyStats(days: number = 30): Promise<{ date: string; views: number }[]> {
  let dailyMap: Record<string, number> = {}
  let total = 0

  if (isVercel()) {
    const stats = await kvGetStats()
    dailyMap = stats.daily
    total = stats.total
  } else {
    const stats = loadLocalStats()
    dailyMap = stats.daily
    total = stats.total
  }

  const result: { date: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = getDateNDaysAgo(i)
    result.push({ date, views: dailyMap[date] || 0 })
  }

  log.info('查询每日统计', { days, dataPoints: result.length, total })
  return result
}

/** 获取总阅读量 */
export async function getTotalViews(): Promise<number> {
  if (isVercel()) {
    const { total } = await kvGetStats()
    return total
  }
  const stats = loadLocalStats()
  return stats.total
}
