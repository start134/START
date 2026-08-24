// 站点级常量：用于 SEO（sitemap/robots/OG/RSS）URL 拼接
// 生产部署时建议在 .env.local 设置 NEXT_PUBLIC_SITE_URL=https://your-domain.com
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'

export const SITE_TITLE = 'START | 个人博客'
export const SITE_DESCRIPTION = '记录设计、技术与生活的细小而重要的事'
export const SITE_AUTHOR = 'START'
export const SITE_CONTACT_EMAIL = 'start_886886@qq.com'
export const SITE_LANG = 'zh-CN'

/** 把本地 "YYYY.MM.DD" 字符串转成 ISO Date（用于 sitemap lastmod / RSS pubDate） */
export function parseLocalDate(s: string): Date {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(s ?? '')
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`)
  return new Date()
}
