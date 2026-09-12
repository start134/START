import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Next 16 App Router Metadata Route：自动输出到 /robots.txt
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 禁止爬取管理后台和 API。
        // robots.txt 的 Disallow 是"前缀匹配"，写 /admin 即可覆盖 /admin 下的全部子路径
        // （包括 /admin/articles/xxx/edit 这类编辑页）。此前只列了 /login、/new、
        // /articles/*/edit，漏掉了后台首页与列表页，与上面这行注释的意图不符。
        disallow: ['/api/', '/admin', '/login', '/new', '/articles/*/edit'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
