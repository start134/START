'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/use-auth'
import { ArticleEditor } from '@/components/article-editor'

export default function AdminNewPost() {
  const router = useRouter()
  const { authed, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!authed) router.replace('/admin/login')
  }, [authed, loading, router])

  if (loading || !authed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="text-sm text-muted-foreground">
          {loading ? '鉴权中…' : '跳转到登录页…'}
        </p>
      </div>
    )
  }

  return (
    <ArticleEditor
      mode="create"
      loginRedirect="/admin/login"
      backHref="/admin/articles"
      backLabel="取消，返回文章列表"
      kicker="新建文章"
      title="写一篇文章"
      intro="支持 Markdown、插图、标签与定时发布；没写完可以存草稿，草稿只有管理员可见。"
    />
  )
}
