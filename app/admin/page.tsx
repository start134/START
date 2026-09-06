'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fetchPosts, type Post } from '@/lib/posts'
import { DailyStatsChart } from '@/components/daily-stats-chart'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/components/toast'
import { apiFetch, errorMessage, isAuthError } from '@/lib/api-client'
import type { Comment } from '@/lib/comments-store'

type DailyStat = {
  date: string
  views: number
}

type StatsResponse = {
  daily: DailyStat[]
  totalViews: number
  todayViews: number
  weekViews: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const t = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  // 数据导入：选择文件 → 二次确认 → POST /api/admin/import
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importPayload, setImportPayload] = useState<{ summary: string; body: unknown } | null>(null)
  const [importing, setImporting] = useState(false)
  // 待办：待审评论数 / 未读通知数
  const [todoPending, setTodoPending] = useState(0)
  const [todoUnread, setTodoUnread] = useState(0)

  useEffect(() => {
    apiFetch<{ unreadCount?: number }>('/api/notifications', { cache: 'no-store' })
      .then((data) => setTodoUnread(data.unreadCount ?? 0))
      .catch(() => {})
    apiFetch<Comment[]>('/api/admin/comments', { cache: 'no-store' })
      .then((data) => setTodoPending(Array.isArray(data) ? data.filter((c) => c.status === 'pending').length : 0))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchPosts().then((p) => {
      console.info('[AdminDashboard] 文章数据加载完成', {
        total: p.length,
        published: p.filter(post => (post.status ?? 'published') === 'published').length,
        draft: p.filter(post => (post.status ?? 'published') === 'draft').length,
      })
      setPosts(p)
      setPostsLoading(false)
    }).catch((err) => {
      console.error('[AdminDashboard] 文章数据加载失败', { error: String(err) })
      setPostsLoading(false)
    })
  }, [])

  useEffect(() => {
    const t0 = performance.now()
    console.info('[AdminDashboard] 开始加载统计数据', { days: 30 })
    const cacheBuster = Date.now()
    fetch(`/api/stats?days=30&_t=${cacheBuster}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((data: StatsResponse) => {
        const duration = Math.round(performance.now() - t0)
        console.info('[AdminDashboard] 统计数据加载完成', {
          days: 30,
          dataPoints: data.daily.length,
          totalViews: data.totalViews,
          todayViews: data.todayViews,
          weekViews: data.weekViews,
          durationMs: duration,
          dateRange: data.daily.length > 0
            ? `${data.daily[0].date} ~ ${data.daily[data.daily.length - 1].date}`
            : 'empty',
        })
        setStats(data)
      })
      .catch((err) => {
        console.error('[AdminDashboard] 统计数据加载失败', {
          error: String(err),
          durationMs: Math.round(performance.now() - t0),
        })
        setStats(null)
      })
      .finally(() => {
        setStatsLoading(false)
      })
  }, [])

  const totalPosts = posts.length
  const publishedPosts = posts.filter(p => (p.status ?? 'published') === 'published').length
  const draftPosts = posts.filter(p => (p.status ?? 'published') === 'draft').length
  const scheduledPosts = posts.filter(p => p.status === 'scheduled').length

  const statCards = [
    { label: '总文章数', value: totalPosts, color: 'text-primary' },
    { label: '已发布', value: publishedPosts, color: 'text-green-500' },
    { label: '草稿', value: draftPosts, color: 'text-amber-500' },
    { label: '定时发布', value: scheduledPosts, color: 'text-sky-500' },
    { label: '总阅读量', value: stats?.totalViews ?? 0, color: 'text-blue-500' },
  ]

  const todoCards = [
    {
      label: '待审评论',
      value: todoPending,
      href: '/admin/comments',
      highlight: todoPending > 0,
      desc: todoPending > 0 ? '有新评论等你审核' : '没有待处理的评论',
    },
    {
      label: '未读通知',
      value: todoUnread,
      href: '/admin/notifications',
      highlight: todoUnread > 0,
      desc: todoUnread > 0 ? '有未读的站内通知' : '通知都看过了',
    },
  ]

  const recentPosts = [...posts]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)

  const onPickImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const body = JSON.parse(text) as Record<string, unknown>
      const parts: string[] = []
      if (Array.isArray(body.posts)) parts.push(`文章 ${body.posts.length} 篇`)
      if (Array.isArray(body.comments)) parts.push(`评论 ${body.comments.length} 条`)
      if (Array.isArray(body.notifications)) parts.push(`通知 ${body.notifications.length} 条`)
      if (body.stats && typeof body.stats === 'object') parts.push('阅读统计')
      if (parts.length === 0) {
        t.error({ title: '备份文件中没有可导入的数据' })
        return
      }
      setImportPayload({ summary: parts.join('、'), body })
    } catch {
      t.error({ title: '文件不是合法的备份 JSON' })
    }
  }

  const onConfirmImport = async () => {
    if (!importPayload) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importPayload.body),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || '导入失败')
      }
      t.success({ title: '导入成功', description: '数据已替换，即将刷新页面。' })
      setImportPayload(null)
      setTimeout(() => router.refresh(), 600)
    } catch (err) {
      const msg = errorMessage(err, '导入失败')
      t.error({ title: isAuthError(err) ? '登录已过期，请重新登录' : msg })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-medium tracking-tight">仪表盘</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          欢迎回来，START。这是您博客的概览。
        </p>
      </div>

      {/* 待办：需要管理员处理的事 */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {todoCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`rounded-lg border p-6 transition-colors ${
              card.highlight
                ? 'border-amber-500/50 bg-amber-500/5 hover:border-amber-500'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`text-2xl font-semibold ${card.highlight ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {card.value}
              </p>
            </div>
            <p className={`mt-2 text-xs ${card.highlight ? 'text-amber-500/90' : 'text-muted-foreground/70'}`}>
              {card.desc}
            </p>
          </Link>
        ))}
      </div>

      {/* 统计卡片 */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card p-6"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${stat.color}`}>
              {(postsLoading || statsLoading) ? '...' : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* 阅读量趋势图 */}
      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        {statsLoading ? (
          <p className="text-sm text-muted-foreground">加载统计数据中...</p>
        ) : stats && stats.daily.length > 0 ? (
          <DailyStatsChart data={stats.daily} days={30} />
        ) : (
          <p className="text-sm text-muted-foreground">
            暂无阅读数据。当有访客阅读文章时，趋势图将自动更新。
          </p>
        )}
      </div>

      {/* 最近文章 */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-medium">最近文章</h2>
          <Link
            href="/admin/articles"
            className="text-sm text-primary hover:underline"
          >
            查看全部
          </Link>
        </div>
        <div className="divide-y divide-border">
          {postsLoading ? (
            <p className="p-6 text-sm text-muted-foreground">加载中...</p>
          ) : recentPosts.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">暂无文章。</p>
          ) : (
            recentPosts.map((post) => (
              <div
                key={post.slug}
                className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/articles/${post.slug}`}
                    className="truncate text-sm font-medium text-foreground hover:text-primary"
                  >
                    {post.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{post.date}</span>
                    <span>·</span>
                    <span>{post.category}</span>
                    <span>·</span>
                    <span className={(post.status ?? 'published') === 'draft' ? 'text-amber-500' : 'text-green-500'}>
                      {(post.status ?? 'published') === 'draft' ? '草稿' : '已发布'}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/admin/articles/${post.slug}/edit`}
                  className="ml-4 shrink-0 text-sm text-muted-foreground hover:text-primary"
                >
                  编辑
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/new"
          className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
        >
          <h3 className="text-lg font-medium">✍️ 写一篇新文章</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            快速创建一篇新的博客文章。
          </p>
        </Link>
        <Link
          href="/admin/articles"
          className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
        >
          <h3 className="text-lg font-medium">📝 管理现有文章</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            编辑、发布或删除您的文章。
          </p>
        </Link>
      </div>

      {/* 数据备份 */}
      <div className="mt-4 rounded-lg border border-border bg-card p-6">
        <h3 className="text-lg font-medium">💾 数据备份</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          所有数据都是单个 JSON 文件，建议定期导出备份；导入会用备份整体替换对应数据。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <a
            href="/api/admin/export"
            className="border border-primary px-4 py-2 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            导出全部数据
          </a>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
          >
            从备份导入…
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onPickImportFile}
          />
        </div>
      </div>

      <ConfirmDialog
        open={!!importPayload}
        title="确认导入数据"
        description={
          importPayload
            ? `将用备份中的内容整体替换现有数据（${importPayload.summary}）。该操作不可撤销，建议先导出当前数据。确定继续？`
            : undefined
        }
        variant="danger"
        confirmText={importing ? '导入中…' : '确认导入'}
        loading={importing}
        onConfirm={onConfirmImport}
        onCancel={() => !importing && setImportPayload(null)}
      />
    </div>
  )
}
