// 阅读量统计：落盘到本地 data/stats.json。
// 命名沿用早期 KV 方案；生产部署的存储要求见 DEPLOYMENT.md。
import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'
import { withFileLock, writeFileAtomic } from '@/lib/storage'
import { ONE_DAY_MS, formatSiteDate, todayInSiteTZ } from '@/lib/site'

const log = createLogger('kv-stats')

// Vercel Serverless 文件系统只读（/tmp 除外），部署到 Vercel 时必须用 /tmp/data
const LOCAL_FILE = process.env.VERCEL
  ? '/tmp/data/stats.json'
  : path.join(process.cwd(), 'data', 'stats.json')
const STATS_LOCK_KEY = 'stats.json'

// 按站点时区（UTC+8）取日期，不能用 getFullYear() 这类本地 getter：
// 部署到 UTC 服务器后，北京时间 00:00–08:00 的阅读量会被记到前一天的分桶里。
function today(): string {
  return todayInSiteTZ()
}

function getDateNDaysAgo(n: number): string {
  return formatSiteDate(new Date(Date.now() - n * ONE_DAY_MS))
}

type StatsData = {
  daily: Record<string, number>
  total: number
  /** 单篇每日阅读量：{ [date]: { [slug]: count } }，保存时只保留最近 90 天 */
  bySlug?: Record<string, Record<string, number>>
}

/** 磁盘上的原始结构（daily 是数组，内存里会归一化成 Record） */
type RawStatsFile = {
  daily?: { date: string; views: number }[]
  totalViews?: number
  bySlug?: Record<string, Record<string, number>>
}

/** 单篇统计保留窗口（与 stats API 的 90 天上限一致） */
const BY_SLUG_RETENTION_DAYS = 90

/** 把磁盘结构归一化成内存结构，同时丢掉脏条目，避免 NaN 混进后续的累加 */
function normalizeStats(data: RawStatsFile): StatsData {
  const daily: Record<string, number> = {}
  for (const entry of data.daily ?? []) {
    if (!entry || typeof entry.date !== 'string' || !Number.isFinite(entry.views)) continue
    daily[entry.date] = entry.views
  }
  return {
    daily,
    total: Number.isFinite(data.totalViews) ? (data.totalViews as number) : 0,
    bySlug: data.bySlug ?? {},
  }
}

/**
 * 把损坏的统计文件改名隔离，而不是直接删掉。
 *
 * 为什么需要这一步：损坏文件如果原地留着，每次读写都会失败，系统就永久卡死；
 * 直接删除又会丢掉人工抢救的可能。改名成 .corrupt-<时间戳>.bak 既让后续请求能正常
 * 走"全新站点"的分支继续服务，又把原始字节留在磁盘上可追查。
 *
 * 隔离本身失败不抛错（可能已被并发请求抢先隔离），由调用方继续抛业务错误。
 */
async function quarantineCorruptStats(): Promise<void> {
  const backup = `${LOCAL_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
  try {
    await fs.rename(LOCAL_FILE, backup)
    log.error('统计文件损坏，已隔离备份', { from: LOCAL_FILE, to: backup })
  } catch (err) {
    log.error('统计文件损坏且隔离失败', { file: LOCAL_FILE, error: String(err) })
  }
}

async function loadLocalStats(): Promise<StatsData> {
  let raw: string
  try {
    raw = await fs.readFile(LOCAL_FILE, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      // 只有"文件确实不存在"才能安全地从零开始（全新站点 / 首次部署）
      return { daily: {}, total: 0 }
    }
    // 权限不足、目录异常等 IO 错误：绝不能伪装成空统计，否则会被下一次写回覆盖
    log.error('读取统计文件失败', { file: LOCAL_FILE, error: String(err) })
    throw err
  }

  try {
    return normalizeStats(JSON.parse(raw) as RawStatsFile)
  } catch (err) {
    // 内容损坏必须抛错，不能返回空统计。
    // incrementTodayViews 是"读全量 → 改 → 写回全量"：若此处把损坏当成空数据返回，
    // 紧接着的 saveLocalStats 就会用"今日 1 次阅读"整体覆盖掉全部历史统计，
    // 把"可修复的文件损坏"变成"历史数据不可逆丢失"。
    // 这与 lib/storage.ts 里 readJSON 的取舍保持一致：宁可让请求失败，也不能静默毁数据。
    await quarantineCorruptStats()
    log.error('统计文件内容损坏，已中止本次读写以避免覆盖历史数据', {
      file: LOCAL_FILE,
      error: String(err),
    })
    throw new Error('统计文件 stats.json 内容损坏，已隔离备份')
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
  // 必须原子写（临时文件 + rename）：直接 fs.writeFile 会先截断再写入，
  // 这中间任何一次并发读取（另一个请求的 getDailyStats）都会读到半截 JSON 而解析失败。
  await writeFileAtomic(
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
    )
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
