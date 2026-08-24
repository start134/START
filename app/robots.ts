import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Next 16 App Router Metadata Route：自动输出到 /robots.txt
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 禁止爬取管理后台和 API
        disallow: ['/api/', '/login', '/new', '/articles/*/edit'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
