'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  fetchPosts,
  deletePost,
  purgePost,
  restorePost,
  type Post,
} from '@/lib/posts'
import { errorMessage, isAuthError } from '@/lib/api-client'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DailyStatsChart } from '@/components/daily-stats-chart'
import { useToast } from '@/components/toast'

type Tab = 'all' | 'published' | 'draft' | 'scheduled' | 'trash'

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'scheduled', label: '定时' },
  { value: 'trash', label: '回收站' },
]

const PAGE_SIZE = 10

export default function AdminArticles() {
  const [posts, setPosts] = useState<Post[]>([]) // 含回收站
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  // 搜索 / 分类筛选 / 分页
  const [searchQ, setSearchQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; title: string } | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<{ slug: string; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [trendPost, setTrendPost] = useState<Post | null>(null)
  const t = useToast()

  const reload = async () => {
    setLoadError('')
    try {
      const p = await fetchPosts({ includeDeleted: true })
      setPosts(p)
    } catch (err) {
      setLoadError(errorMessage(err, '加载文章失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const statusOf = (p: Post) => p.status ?? 'published'
  const activeByTab = useMemo(() => {
    const active = posts.filter((p) => !p.deletedAt)
    if (tab === 'trash') return posts.filter((p) => !!p.deletedAt)
    if (tab === 'all') return active
    return active.filter((p) => statusOf(p) === tab)
  }, [posts, tab])

  // 分类下拉选项（当前页签范围内）
  const categories = useMemo(() => {
    const seen = new Set<string>()
    for (const p of activeByTab) {
      if (p.category) seen.add(p.category)
    }
    return Array.from(seen).sort()
  }, [activeByTab])

  // 搜索 + 分类筛选
  const searched = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    let out = activeByTab
    if (categoryFilter) out = out.filter((p) => p.category === categoryFilter)
    if (q) {
      out = out.filter((p) =>
        `${p.title}${p.category}${(p.tags ?? []).join(' ')}${p.slug}`.toLowerCase().includes(q)
      )
    }
    return [...out].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [activeByTab, searchQ, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(searched.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedPosts = searched.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [tab, searchQ, categoryFilter])

  const sortedPosts = pagedPosts
  const trashCount = posts.filter((p) => !!p.deletedAt).length

  const onDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deletePost(deleteTarget.slug)
      setPosts((prev) =>
        prev.map((p) =>
          p.slug === deleteTarget.slug && !p.deletedAt
            ? { ...p, deletedAt: new Date().toISOString() }
            : p
        )
      )
      t.success({ title: '已移入回收站', description: `《${deleteTarget.title}》可在回收站恢复。` })
    } catch (err) {
      let msg = errorMessage(err, '删除失败')
      if (isAuthError(err)) msg = '登录已过期，请重新登录'
      t.error({ title: msg })
    } finally {
      setBusy(false)
      setDeleteTarget(null)
    }
  }

  const onRestore = async (post: Post) => {
    try {
      await restorePost(post.slug)
      setPosts((prev) =>
        prev.map((p) => {
          if (p.slug !== post.slug) return p
          const next = { ...p }
          delete next.deletedAt
          return next
        })
      )
      t.success({ title: '已恢复', description: `《${post.title}》已从回收站恢复。` })
    } catch (err) {
      let msg = errorMessage(err, '恢复失败')
      if (isAuthError(err)) msg = '登录已过期，请重新登录'
      t.error({ title: msg })
    }
  }

  const onPurge = async () => {
    if (!purgeTarget) return
    setBusy(true)
    try {
      await purgePost(purgeTarget.slug)
      setPosts((prev) => prev.filter((p) => p.slug !== purgeTarget.slug))
      t.success({ title: '已彻底删除', description: `《${purgeTarget.title}》已永久移除。` })
    } catch (err) {
      let msg = errorMessage(err, '删除失败')
      if (isAuthError(err)) msg = '登录已过期，请重新登录'
      t.error({ title: msg })
    } finally {
      setBusy(false)
      setPurgeTarget(null)
    }
  }

  const statusBadge = (p: Post) => {
    const status = statusOf(p)
    if (p.deletedAt) {
      return <span className="rounded-full bg-zinc-500/10 px-2 py-1 text-xs font-medium text-zinc-400">回收站</span>
    }
    if (status === 'draft') {
      return <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500">草稿</span>
    }
    if (status === 'scheduled') {
      return (
        <span
          className="rounded-full bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400"
          title={p.publishAt ? `发布于 ${new Date(p.publishAt).toLocaleString('zh-CN')}` : undefined}
        >
          定时{p.publishAt ? ` · ${new Date(p.publishAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      )
    }
    return <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">已发布</span>
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">文章管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            管理所有文章；删除会先进入回收站，可随时恢复。
          </p>
        </div>
        <Link
          href="/admin/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          写新文章
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {TABS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setTab(s.value)}
            className={`border px-3 py-1.5 transition-colors ${
              tab === s.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
            }`}
          >
            {s.label}
            {s.value === 'trash' && trashCount > 0 ? ` (${trashCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          加载中...
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-destructive/40 bg-card p-12 text-center">
          <p className="text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => { setLoading(true); reload() }}
            className="mt-4 border border-border px-4 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
          >
            重试
          </button>
        </div>
      ) : searched.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {tab === 'trash'
              ? '回收站是空的。'
              : searchQ || categoryFilter
                ? '没有符合筛选条件的文章。'
                : '还没有符合条件的文章。'}
          </p>
          {tab !== 'trash' && !searchQ && !categoryFilter && (
            <Link href="/admin/new" className="mt-4 inline-block text-primary hover:underline">
              去写第一篇
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* 搜索 + 分类筛选 */}
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex w-full max-w-xs items-center gap-2 border-b border-border pb-1.5 text-muted-foreground focus-within:border-primary">
              <span aria-hidden="true">⌕</span>
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜索标题 / 标签 / 分类"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
                aria-label="搜索文章"
              />
              {searchQ && (
                <button
                  type="button"
                  onClick={() => setSearchQ('')}
                  aria-label="清除搜索"
                  className="text-xs hover:text-primary"
                >
                  ✕
                </button>
              )}
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="按分类筛选"
              className="border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground outline-none transition-colors hover:border-primary focus:border-primary"
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              共 {searched.length} 篇
            </span>
          </div>

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
                    {(post.tags?.length ?? 0) > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground/70">
                        {post.tags!.join(' / ')}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                    {post.date}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                    {post.category}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">{statusBadge(post)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                    {post.views ?? 0}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    {post.deletedAt ? (
                      <div className="inline-flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => onRestore(post)}
                          className="text-primary hover:underline"
                        >
                          恢复
                        </button>
                        <button
                          type="button"
                          onClick={() => setPurgeTarget({ slug: post.slug, title: post.title })}
                          className="text-destructive hover:underline"
                        >
                          彻底删除
                        </button>
                      </div>
                    ) : (
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
                          type="button"
                          onClick={() => setTrendPost(post)}
                          className="text-muted-foreground hover:text-primary"
                        >
                          趋势
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ slug: post.slug, title: post.title })}
                          className="text-destructive hover:underline"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-4 text-sm">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                className="border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                ← 上一页
              </button>
              <span className="text-xs text-muted-foreground">
                第 {safePage} / {totalPages} 页
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
                className="border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                下一页 →
              </button>
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title="删除文章"
          description={`确定删除《${deleteTarget.title}》？文章会先进入回收站，可随时恢复。`}
          variant="danger"
          confirmText="移入回收站"
          loading={busy}
          onConfirm={onDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {purgeTarget && (
        <ConfirmDialog
          open={!!purgeTarget}
          title="彻底删除"
          description={`确定彻底删除《${purgeTarget.title}》？此操作不可恢复。`}
          variant="danger"
          confirmText="彻底删除"
          loading={busy}
          onConfirm={onPurge}
          onCancel={() => setPurgeTarget(null)}
        />
      )}

      {trendPost && <TrendDialog post={trendPost} onClose={() => setTrendPost(null)} />}
    </div>
  )
}

/** 单篇文章近 30 天阅读趋势弹层 */
function TrendDialog({ post, onClose }: { post: Post; onClose: () => void }) {
  const [daily, setDaily] = useState<{ date: string; views: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/stats?slug=${encodeURIComponent(post.slug)}&days=30`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { daily?: { date: string; views: number }[] }) => setDaily(data.daily ?? []))
      .catch(() => setDaily([]))
      .finally(() => setLoading(false))
  }, [post.slug])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">阅读趋势</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              《{post.title}》 · 近 30 天 · 累计 {post.views ?? 0} 次
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-primary"
            aria-label="关闭趋势图"
          >
            ✕
          </button>
        </div>
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
        ) : (
          <DailyStatsChart data={daily} days={30} />
        )}
      </div>
    </div>
  )
}
