'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Comment } from '@/lib/comments-store'
import type { Post } from '@/lib/posts'
import { fetchPosts } from '@/lib/posts'
import { apiFetch, errorMessage, isAuthError } from '@/lib/api-client'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/components/toast'

type Filter = 'all' | 'pending' | 'approved'

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([])
  const [postTitles, setPostTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState<Filter>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchConfirm, setBatchConfirm] = useState<{ action: 'approve' | 'delete'; count: number } | null>(null)
  const [deleteSingle, setDeleteSingle] = useState<Comment | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // 内联回复
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const t = useToast()

  const fetchComments = useCallback(async () => {
    setLoadError('')
    try {
      const data = await apiFetch<Comment[]>('/api/admin/comments', { cache: 'no-store' })
      setComments(Array.isArray(data) ? data : [])
    } catch (err) {
      setLoadError(errorMessage(err, '获取评论失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchComments()
    // 拉文章标题做上下文展示（评论只存了 slug）
    fetchPosts()
      .then((posts: Post[]) => {
        const map: Record<string, string> = {}
        for (const p of posts) map[p.slug] = p.title
        setPostTitles(map)
      })
      .catch(() => {
        // 标题拿不到只影响展示
      })
  }, [fetchComments])

  const filteredComments = useMemo(() => {
    const list = comments.filter(c => {
      if (filter === 'pending') return c.status === 'pending'
      if (filter === 'approved') return c.status === 'approved'
      return true
    })
    // 待审在前，同级按时间倒序
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [comments, filter])

  const pendingCount = comments.filter(c => c.status === 'pending').length
  const approvedCount = comments.filter(c => c.status === 'approved').length

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectableIds = filteredComments.map(c => c.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(selectableIds))
  }

  const runBatch = async (action: 'approve' | 'delete') => {
    if (selected.size === 0) return
    setBatchBusy(true)
    try {
      const result = await apiFetch<{ updated?: number; deleted?: number; missing: string[] }>(
        '/api/admin/comments',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids: Array.from(selected) }),
        }
      )
      const done = action === 'approve' ? result.updated ?? 0 : result.deleted ?? 0
      t.success({
        title: action === 'approve' ? '批量批准完成' : '批量删除完成',
        description: `处理 ${done} 条${result.missing.length ? `，${result.missing.length} 条已不存在` : ''}。`,
      })
      setSelected(new Set())
      setBatchConfirm(null)
      await fetchComments()
    } catch (err) {
      t.error({ title: isAuthError(err) ? '登录已过期，请重新登录' : errorMessage(err, '批量操作失败') })
    } finally {
      setBatchBusy(false)
    }
  }

  const handleApprove = async (comment: Comment) => {
    setBusyId(comment.id)
    try {
      await apiFetch('/api/admin/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'approve' }),
      })
      setComments(prev => prev.map(c => (c.id === comment.id ? { ...c, status: 'approved' } : c)))
      t.success({ title: '已批准' })
    } catch (err) {
      t.error({ title: isAuthError(err) ? '登录已过期，请重新登录' : errorMessage(err, '批准失败') })
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteSingle = async () => {
    if (!deleteSingle) return
    setBusyId(deleteSingle.id)
    try {
      await apiFetch('/api/admin/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteSingle.id, action: 'delete' }),
      })
      setComments(prev => prev.filter(c => c.id !== deleteSingle.id && c.parentId !== deleteSingle.id))
      t.success({ title: '已删除' })
      setDeleteSingle(null)
    } catch (err) {
      t.error({ title: isAuthError(err) ? '登录已过期，请重新登录' : errorMessage(err, '删除失败') })
    } finally {
      setBusyId(null)
    }
  }

  const handleReply = async () => {
    if (!replyTo || !replyText.trim()) return
    setReplying(true)
    try {
      const reply = await apiFetch<Comment>('/api/admin/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: replyTo.id, content: replyText.trim() }),
      })
      // 若原评论还在待审，服务端会一并批准
      setComments(prev => [
        ...prev.map(c => (c.id === replyTo.id ? { ...c, status: 'approved' as const } : c)),
        reply,
      ])
      t.success({ title: '回复成功', description: '回复已发布并显示在文章下。' })
      setReplyTo(null)
      setReplyText('')
    } catch (err) {
      t.error({ title: isAuthError(err) ? '登录已过期，请重新登录' : errorMessage(err, '回复失败') })
    } finally {
      setReplying(false)
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-medium tracking-tight">评论管理</h1>
        <div className="mt-8 rounded-lg border border-destructive/40 bg-card p-12 text-center">
          <p className="text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => { setLoading(true); fetchComments() }}
            className="mt-4 border border-border px-4 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-medium tracking-tight">评论管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          审核新评论、批量处理、以博主身份回复（回复自动过审）。
        </p>
      </div>

      {/* 页签统计卡片 */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {([
          { key: 'all', label: '全部评论', count: comments.length, active: 'border-primary bg-primary/5' },
          { key: 'pending', label: '待审核', count: pendingCount, active: 'border-amber-500 bg-amber-500/5' },
          { key: 'approved', label: '已发布', count: approvedCount, active: 'border-green-500 bg-green-500/5' },
        ] as const).map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => { setFilter(card.key); setSelected(new Set()) }}
            className={`rounded-lg border p-4 text-left transition-colors ${
              filter === card.key
                ? card.active
                : 'border-border bg-card hover:border-primary/50'
            }`}
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${card.key === 'pending' ? 'text-amber-500' : card.key === 'approved' ? 'text-green-500' : ''}`}>
              {card.count}
            </p>
          </button>
        ))}
      </div>

      {/* 批量操作工具条 */}
      {filteredComments.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="accent-[currentColor]"
            />
            全选本页（{filteredComments.length} 条）
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-primary">已选 {selected.size} 条</span>
              <button
                type="button"
                onClick={() => setBatchConfirm({ action: 'approve', count: selected.size })}
                className="border border-green-500/50 px-3 py-1.5 text-xs text-green-500 transition-colors hover:bg-green-500/10"
              >
                批量批准
              </button>
              <button
                type="button"
                onClick={() => setBatchConfirm({ action: 'delete', count: selected.size })}
                className="border border-destructive/50 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
              >
                批量删除
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                取消选择
              </button>
            </>
          )}
        </div>
      )}

      {/* 评论列表 */}
      {filteredComments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {filter === 'all'
              ? '暂无评论'
              : filter === 'pending'
              ? '没有待审核的评论 🎉'
              : '没有已发布的评论'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {filteredComments.map(comment => {
            const isSelected = selected.has(comment.id)
            return (
              <div
                key={comment.id}
                className={`p-4 transition-colors ${comment.status === 'pending' ? 'bg-amber-500/[0.03]' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(comment.id)}
                        aria-label={`选择 ${comment.name} 的评论`}
                        className="accent-[currentColor]"
                      />
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
                      {comment.parentId && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          回复
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">
                      {comment.content}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="max-w-[16rem] truncate">
                        《{postTitles[comment.postSlug] ?? comment.postSlug}》
                      </span>
                      <Link
                        href={`/articles/${comment.postSlug}`}
                        className="hover:text-primary transition-colors"
                      >
                        查看文章 →
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(replyTo?.id === comment.id ? null : comment)
                        setReplyText('')
                      }}
                      className="border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {replyTo?.id === comment.id ? '收起' : '回复'}
                    </button>
                    {comment.status === 'pending' && (
                      <button
                        type="button"
                        disabled={busyId === comment.id}
                        onClick={() => handleApprove(comment)}
                        className="border border-green-500/50 px-3 py-1.5 text-xs text-green-500 transition-colors hover:bg-green-500/10 disabled:opacity-50"
                      >
                        {busyId === comment.id ? '处理中…' : '批准'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteSingle(comment)}
                      className="border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    >
                      删除
                    </button>
                  </div>
                </div>

                {/* 内联回复框 */}
                {replyTo?.id === comment.id && (
                  <div className="mt-3 ml-6 border border-border bg-background p-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      placeholder={`以 ${'START'} 的身份回复…（发布后自动过审，显示在文章评论区）`}
                      className="w-full resize-y border-b border-border bg-transparent pb-2 text-sm outline-none transition-colors focus:border-primary"
                    />
                    <div className="mt-2 flex items-center justify-end gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => { setReplyTo(null); setReplyText('') }}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={replying || !replyText.trim()}
                        onClick={handleReply}
                        className="border border-primary px-3 py-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                      >
                        {replying ? '发布中…' : '发布回复'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 单条删除确认 */}
      <ConfirmDialog
        open={!!deleteSingle}
        title="删除评论"
        description="确定删除这条评论？其下所有回复也会一并删除，此操作不可恢复。"
        confirmText={busyId ? '删除中...' : '删除'}
        variant="danger"
        loading={!!busyId}
        onConfirm={handleDeleteSingle}
        onCancel={() => !busyId && setDeleteSingle(null)}
      />

      {/* 批量操作确认 */}
      <ConfirmDialog
        open={!!batchConfirm}
        title={batchConfirm?.action === 'approve' ? '批量批准' : '批量删除'}
        description={
          batchConfirm?.action === 'approve'
            ? `确定批准选中的 ${batchConfirm?.count ?? 0} 条评论？批准后立即对访客可见。`
            : `确定删除选中的 ${batchConfirm?.count ?? 0} 条评论？其下回复会一并删除，此操作不可恢复。`
        }
        variant={batchConfirm?.action === 'approve' ? 'default' : 'danger'}
        confirmText={batchBusy ? '处理中…' : batchConfirm?.action === 'approve' ? '批准' : '删除'}
        loading={batchBusy}
        onConfirm={() => batchConfirm && runBatch(batchConfirm.action)}
        onCancel={() => !batchBusy && setBatchConfirm(null)}
      />
    </div>
  )
}
