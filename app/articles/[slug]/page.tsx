import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getAdjacentPosts,
  getRelatedPosts,
  isPublishedPost,
  promoteScheduledPosts,
  readPost,
} from '@/lib/posts-store'
import { isAuthenticatedRequest } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { ArticleView } from '@/components/article-view'
import {
  SITE_URL,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_AUTHOR,
  parseLocalDate,
} from '@/lib/site'

export const dynamic = 'force-dynamic'

const log = createLogger('article-page')

// 详情页（Server Component）：
//  - generateMetadata 动态生成 OG/Twitter Card，分享到微信/微博/Telegram 出卡片
//  - 服务端直接读 post 数据传给 ArticleView，首屏不白屏
//  - 文章不存在 → notFound() 走 app/not-found.tsx
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await readPost(slug)
  if (!post || (!isPublishedPost(post) && !(await isAuthenticatedRequest()))) {
    // 草稿不向未登录访客泄露标题/摘要（页面本身同样 404）
    return {
      title: `文章不存在 | ${SITE_TITLE}`,
      description: '该文章可能已被删除或链接有误。',
    }
  }
  const url = `${SITE_URL}/articles/${slug}`
  const description = post.excerpt || SITE_DESCRIPTION
  const publishedTime = parseLocalDate(post.date).toISOString()

  return {
    title: post.title,
    description,
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': `${SITE_URL}/rss.xml`,
      },
    },
    openGraph: {
      title: post.title,
      description,
      url,
      siteName: SITE_TITLE,
      locale: 'zh_CN',
      type: 'article',
      publishedTime,
      authors: [SITE_AUTHOR],
      tags: [post.category],
    },
    twitter: {
      card: 'summary',
      title: post.title,
      description,
    },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  // 到点的定时文章先转正（无到点文章时是纯读操作）
  try {
    await promoteScheduledPosts()
  } catch (err) {
    log.warn('定时文章提升失败', { slug, error: String(err) })
  }
  const post = await readPost(slug)
  if (!post) {
    notFound()
  }
  // 草稿/未到点定时文鉴权：非管理员不能看
  if (!isPublishedPost(post) && !(await isAuthenticatedRequest())) {
    log.warn('草稿鉴权失败：非管理员访问草稿，返回 404', { slug })
    notFound()
  }
  // 上一篇 / 下一篇（只含已发布）
  const adjacent = await getAdjacentPosts(slug)
  const related = await getRelatedPosts(slug)
  const canonicalUrl = `${SITE_URL}/articles/${slug}`

  // JSON-LD 结构化数据：帮助搜索引擎理解文章元信息
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: parseLocalDate(post.date).toISOString(),
    author: { '@type': 'Person', name: SITE_AUTHOR },
    publisher: { '@type': 'Organization', name: SITE_TITLE },
    mainEntityOfPage: canonicalUrl,
    image: `${SITE_URL}/articles/${slug}/opengraph-image`,
    articleSection: post.category,
    ...(post.tags?.length ? { keywords: post.tags.join(', ') } : {}),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleView
        key={slug}
        post={post}
        prev={adjacent.prev}
        next={adjacent.next}
        related={related}
      />
    </>
  )
}
