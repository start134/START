import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { readPost, getAdjacentPosts } from '@/lib/posts-store'
import { auth, validateSession } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { ArticleView } from '@/components/article-view'
import {
  SITE_URL,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_AUTHOR,
  parseLocalDate,
} from '@/lib/site'

const log = createLogger('article-page')

// 详情页（Server Component）：
//  - generateMetadata 动态生成 OG/Twitter Card，分享到微信/微博/Telegram 出卡片
//  - 服务端直接读 post 数据传给 ArticleView，首屏不白屏
//  - 文章不存在 → notFound() 走 app/not-found.tsx
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await readPost(slug)
  if (!post) {
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
  const post = await readPost(slug)
  if (!post) {
    notFound()
  }
  // 草稿鉴权：非管理员不能看草稿
  if ((post.status ?? 'published') === 'draft') {
    log.info('文章是草稿，开始鉴权', { slug })
    const cookieStore = await cookies()
    const token = cookieStore.get(auth.cookieName)?.value
    if (!validateSession(token)) {
      log.warn('草稿鉴权失败：非管理员访问草稿，返回 404', { slug })
      notFound()
    }
    log.info('草稿鉴权通过：管理员访问草稿', { slug })
  }
  // 上一篇 / 下一篇（只含已发布）
  const adjacent = await getAdjacentPosts(slug)
  return (
    <ArticleView
      key={slug}
      post={post}
      prev={adjacent.prev}
      next={adjacent.next}
    />
  )
}
