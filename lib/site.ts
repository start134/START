// 站点级常量：用于 SEO（sitemap/robots/OG/RSS）URL 拼接
// 生产部署时建议在 .env.local 设置 NEXT_PUBLIC_SITE_URL=https://your-domain.com
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'

export const SITE_TITLE = 'START | 个人博客'
export const SITE_DESCRIPTION = '记录设计、技术与生活的细小而重要的事'
export const SITE_AUTHOR = 'START'
export const SITE_CONTACT_EMAIL = 'start_886886@qq.com'
export const SITE_LANG = 'zh-CN'

/** 站点统一时区（东八区）偏移，单位毫秒。与 parseLocalDate 里的 +08:00 保持一致 */
export const SITE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

/** 一天的毫秒数（站点时区无夏令时，可直接做整日加减） */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** 把本地 "YYYY.MM.DD" 字符串转成 ISO Date（用于 sitemap lastmod / RSS pubDate） */
export function parseLocalDate(s: string): Date {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(s ?? '')
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`)
  return new Date()
}

/**
 * 取某个时刻在「站点时区（UTC+8）」下的 "YYYY.MM.DD"。
 *
 * 为什么不能直接用 `d.getFullYear()` 这一类本地时间 getter：
 * 它们读的是「服务器进程所在时区」。本地开发时是东八区，看着没问题；
 * 一旦部署到 Vercel / Docker（默认 UTC），北京时间 00:00–08:00 这段会被算成前一天，
 * 导致文章落款日期、阅读量按日分桶、"今日新文" 全部错位一天。
 *
 * 做法：先把时间轴整体平移到 UTC+8，再用 getUTC* 读取——等价于「固定偏移时区」的取值方式，
 * 与服务器本地时区彻底解耦，也不依赖 Intl/ICU 数据是否完整。
 */
export function formatSiteDate(d: Date): string {
  const shifted = new Date(d.getTime() + SITE_UTC_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

/** 当前时刻的站点时区日期 "YYYY.MM.DD" */
export function todayInSiteTZ(): string {
  return formatSiteDate(new Date())
}
