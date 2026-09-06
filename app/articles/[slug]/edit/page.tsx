'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/use-auth'
import { ArticleEditor } from '@/components/article-editor'
import { fetchPost, type Post } from '@/lib/posts'

export default function EditPostPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()
  const { authed, loading: authLoading } = useAuth()
  const [post, setPost] = useState<Post | undefined>(undefined)
  const [ready, setReady] = useState(false)

  // 未登录跳登录页，登录成功再回来
  useEffect(() => {
    if (authLoading) return
    if (!authed) router.replace(`/login?next=/articles/${slug}/edit`)
  }, [authed, authLoading, router, slug])

  useEffect(() => {
    if (authLoading || !authed) return
    fetchPost(slug).then((p) => {
      setPost(p)
      setReady(true)
    })
  }, [slug, authed, authLoading])

  if (authLoading || !authed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="text-sm text-muted-foreground">
          {authLoading ? '鉴权中…' : '跳转到登录页…'}
        </p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="font-mono text-xs tracking-[0.2em] text-primary">未找到</p>
        <h1 className="mt-3 text-3xl tracking-tight">文章不存在</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          文章可能已被删除，或在管理后台的回收站中。
        </p>
        <Link
          href="/articles"
          className="mt-8 inline-block text-sm text-muted-foreground hover:text-primary"
        >
          ← 返回文章列表
        </Link>
      </div>
    )
  }

  return (
    <ArticleEditor
      key={slug}
      mode="edit"
      slug={slug}
      post={post}
      loginRedirect={`/login?next=/articles/${slug}/edit`}
      backHref="/articles"
      backLabel="取消，返回文章列表"
      kicker="编辑模式"
      title="编辑文章"
      intro="支持 Markdown、插图、标签与定时发布；编辑内容会自动保存在本机。"
    />
  )
}
