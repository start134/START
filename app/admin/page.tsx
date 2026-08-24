'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchPosts, type Post } from '@/lib/posts'
import { DailyStatsChart } from '@/components/daily-stats-chart'

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
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

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

  const statCards = [
    { label: '总文章数', value: totalPosts, color: 'text-primary' },
    { label: '已发布', value: publishedPosts, color: 'text-green-500' },
    { label: '草稿', value: draftPosts, color: 'text-amber-500' },
    { label: '总阅读量', value: stats?.totalViews ?? 0, color: 'text-blue-500' },
  ]

  const recentPosts = [...posts]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-medium tracking-tight">仪表盘</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          欢迎回来，START。这是您博客的概览。
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  )
}
