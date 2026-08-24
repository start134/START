'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchPosts, deletePost, type Post } from '@/lib/posts'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/components/toast'

export default function AdminArticles() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const t = useToast()

  useEffect(() => {
    fetchPosts().then((p) => {
      setPosts(p)
      setLoading(false)
    })
  }, [])

  const onDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deletePost(deleteTarget.slug)
      setPosts((prev) => prev.filter((p) => p.slug !== deleteTarget.slug))
      t.success({ title: '已删除', description: `《${deleteTarget.title}》已移除。` })
      setDeleting(false)
      setDeleteTarget(null)
    } catch (err) {
      let msg = err instanceof Error ? err.message : '删除失败'
      if (msg.includes('401') || msg.includes('登录')) msg = '登录已过期，请重新登录'
      if (msg.includes('404') || msg.includes('未找到')) msg = '文章不存在或已被删除'
      t.error({ title: msg })
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const sortedPosts = [...posts].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">文章管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            管理您的所有文章，包括已发布和草稿。
          </p>
        </div>
        <Link
          href="/admin/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          写新文章
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          加载中...
        </div>
      ) : sortedPosts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">还没有任何文章。</p>
          <Link
            href="/admin/new"
            className="mt-4 inline-block text-primary hover:underline"
          >
            去写第一篇
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  标题
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  日期
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  分类
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  阅读量
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedPosts.map((post) => (
                <tr key={post.slug} className="transition-colors hover:bg-muted/30">
                  <td className="whitespace-nowrap px-6 py-4">
                    <Link
                      href={`/articles/${post.slug}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {post.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                    {post.date}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                    {post.category}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    {(post.status ?? 'published') === 'draft' ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500">
                        草稿
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">
                        已发布
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                    {post.views ?? 0}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <div className="inline-flex items-center gap-4">
                      <Link
                        href={`/admin/articles/${post.slug}/edit`}
                        className="text-primary hover:underline"
                      >
                        编辑
                      </Link>
                      <Link
                        href={`/articles/${post.slug}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        预览
                      </Link>
                      <button
                        onClick={() => setDeleteTarget({ slug: post.slug, title: post.title })}
                        className="text-destructive hover:underline"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title="删除文章"
          description={`确定删除《${deleteTarget.title}》？此操作不可恢复。`}
          variant="danger"
          confirmText="删除"
          loading={deleting}
          onConfirm={onDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
