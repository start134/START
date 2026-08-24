'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Comment } from '@/lib/comments-store'
import { ConfirmDialog } from '@/components/confirm-dialog'

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/comments', { cache: 'no-store' })
      if (!res.ok) throw new Error('获取评论失败')
      const data = await res.json()
      setComments(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('获取评论失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handleApprove = async (id: string) => {
    try {
      await fetch('/api/admin/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      })
      fetchComments()
    } catch (err) {
      console.error('批准评论失败:', err)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleteLoading(true)
    try {
      await fetch('/api/admin/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteId, action: 'delete' }),
      })
      setDeleteId(null)
      fetchComments()
    } catch (err) {
      console.error('删除评论失败:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const filteredComments = comments.filter(c => {
    if (filter === 'pending') return c.status === 'pending'
    if (filter === 'approved') return c.status === 'approved'
    return true
  })

  const pendingCount = comments.filter(c => c.status === 'pending').length
  const approvedCount = comments.filter(c => c.status === 'approved').length

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-medium tracking-tight">评论管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          管理所有评论，审核待发布的评论。
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-lg border p-4 text-left transition-colors ${
            filter === 'all'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card hover:border-primary/50'
          }`}
        >
          <p className="text-sm text-muted-foreground">全部评论</p>
          <p className="mt-1 text-2xl font-semibold">{comments.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`rounded-lg border p-4 text-left transition-colors ${
            filter === 'pending'
              ? 'border-amber-500 bg-amber-500/5'
              : 'border-border bg-card hover:border-amber-500/50'
          }`}
        >
          <p className="text-sm text-muted-foreground">待审核</p>
          <p className="mt-1 text-2xl font-semibold text-amber-500">{pendingCount}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('approved')}
          className={`rounded-lg border p-4 text-left transition-colors ${
            filter === 'approved'
              ? 'border-green-500 bg-green-500/5'
              : 'border-border bg-card hover:border-green-500/50'
          }`}
        >
          <p className="text-sm text-muted-foreground">已发布</p>
          <p className="mt-1 text-2xl font-semibold text-green-500">{approvedCount}</p>
        </button>
      </div>

      {/* 评论列表 */}
      {filteredComments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {filter === 'all'
              ? '暂无评论'
              : filter === 'pending'
              ? '没有待审核的评论'
              : '没有已发布的评论'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {filteredComments.map(comment => (
            <div
              key={comment.id}
              className={`p-4 ${comment.status === 'pending' ? 'bg-amber-500/[0.02]' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{comment.name}</span>
                    {comment.email && (
                      <span className="text-muted-foreground/50">({comment.email})</span>
                    )}
                    <span className="text-muted-foreground/50">·</span>
                    <time className="text-xs text-muted-foreground">
                      {formatDate(comment.createdAt)}
                    </time>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        comment.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-green-500/10 text-green-500'
                      }`}
                    >
                      {comment.status === 'pending' ? '待审核' : '已发布'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Link
                      href={`/articles/${comment.postSlug}`}
                      className="hover:text-primary transition-colors"
                    >
                      查看文章 →
                    </Link>
                    {comment.parentId && (
                      <span className="text-muted-foreground/50">· 回复评论</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {comment.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(comment.id)}
                      className="border border-green-500/50 px-3 py-1.5 text-xs text-green-500 transition-colors hover:bg-green-500/10"
                    >
                      批准
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteId(comment.id)}
                    className="border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="删除评论"
        description="确定删除这条评论？此操作不可恢复。"
        confirmText={deleteLoading ? '删除中...' : '删除'}
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => !deleteLoading && setDeleteId(null)}
      />
    </div>
  )
}
