import type { MetadataRoute } from 'next'
import { isPublishedPost, promoteScheduledPosts, readAllPosts } from '@/lib/posts-store'
import { SITE_URL, parseLocalDate } from '@/lib/site'

// Next 16 App Router Metadata Route：自动输出到 /sitemap.xml
//
// 必须声明 force-dynamic。Metadata Route 默认在 `next build` 时静态预渲染成
// .next/server/app/sitemap.xml.body 快照，运行时直接回放这份构建产物；
// 而文章列表来自运行时可变的 data/posts.json，静态化会让新建/删除的文章
// 永远不出现在（或永远留在）sitemap 里，直到下一次重新构建。
// 文件存储没有可用的持久化缓存层，这里选择每次请求实时生成，保证与数据一致。
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 到点定时文先转正；草稿/未到点定时文不出现在 sitemap
  try {
    await promoteScheduledPosts()
  } catch {
    // 提升失败不阻塞 sitemap 输出
  }
  const posts = (await readAllPosts()).filter((p) => isPublishedPost(p))
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/articles`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/articles/${p.slug}`,
    lastModified: parseLocalDate(p.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticEntries, ...postEntries]
}
