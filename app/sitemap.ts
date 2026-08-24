import type { MetadataRoute } from 'next'
import { readAllPosts } from '@/lib/posts-store'
import { SITE_URL, parseLocalDate } from '@/lib/site'

// Next 16 App Router Metadata Route：自动输出到 /sitemap.xml
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await readAllPosts()
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
