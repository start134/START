'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/use-auth'
import { fetchPosts, type Post } from '@/lib/posts'
import { todayInSiteTZ } from '@/lib/site'

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [today, setToday] = useState<string | null>(null)
  const { authed } = useAuth()

  const loadPosts = () => {
    setLoading(true)
    setLoadError(false)
    fetchPosts()
      .then((p) => {
        setPosts(p)
        setLoading(false)
      })
      .catch(() => {
        setLoadError(true)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadPosts()
    // 仅挂载时加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 日期依赖客户端时区，SSR(here: UTC) 与 hydration(浏览器时区) 可能不同。
  // 延迟到 mount 后再取值，保证 SSR 与首次客户端渲染一致，避免 hydration mismatch。
  useEffect(() => {
    // 用站点时区（UTC+8）而不是浏览器本地时区：
    // 文章落款 p.date 是服务端按站点时区生成的，用访客本地时区比较，
    // 海外访客（或跨时区出差时）会看到"今日新文"错位一天。
    setToday(todayInSiteTZ())
  }, [])

  const { todays, rest } = useMemo(() => {
    const todays: Post[] = []
    const rest: Post[] = []
    for (const p of posts) {
      if ((p.status ?? 'published') === 'draft') continue // 首页不显示草稿
      if (today && p.date === today) todays.push(p)
      else rest.push(p)
    }
    return { todays, rest }
  }, [posts, today])

  const latest = rest.slice(0, 3)

  return (
    <>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-24 lg:px-8 lg:pb-20 lg:pt-36">
        <p className="mb-6 font-mono text-xs tracking-[0.24em] text-primary">
          独立创作者 · 设计 · 技术 · 生活
        </p>
        <h1 className="max-w-3xl text-balance text-5xl font-medium leading-[1.08] tracking-[-0.06em] sm:text-7xl">
          记录正在发生的
          <br />
          <span className="text-primary">细小而重要的事。</span>
        </h1>
        <p className="mt-8 max-w-lg text-pretty text-base leading-7 text-muted-foreground">
          你好，这里是 START。一个关于创造、思考，以及日常生活片段的角落。
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4 text-sm">
          <Link
            href="/articles"
            className="inline-flex items-center gap-3 text-foreground transition-colors hover:text-primary"
          >
            开始阅读 <span aria-hidden="true">→</span>
          </Link>
          {authed && (
            <Link
              href="/admin"
              className="border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary"
            >
              管理后台
            </Link>
          )}
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-5xl px-6 py-16 lg:px-8">
          <div className="mb-6 flex items-end justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="mt-3 text-2xl tracking-tight">最近的文章</h2>
            </div>
            <Link
              href="/articles"
              className="flex-none text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              查看全部 →
            </Link>
          </div>

          {/* 横线位置：今日新文单独展示 */}
          {!loading && todays.length > 0 ? (
            <div className="mb-10 border border-primary/20 bg-primary/[0.04] p-6 md:p-8">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-xs tracking-[0.2em] text-primary">
                  今日新文 · {today}
                </p>
                <span className="font-mono text-xs text-muted-foreground">
                  共 {todays.length} 篇
                </span>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {todays.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/articles/${post.slug}`}
                    className="group flex flex-col gap-3 border border-border bg-card p-5 transition-colors hover:border-primary"
                  >
                    <div className="flex items-center gap-3 text-xs text-primary">
                      <span>{post.category}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-muted-foreground">
                        {post.read}阅读
                      </span>
                    </div>
                    <h3 className="text-xl tracking-tight transition-colors group-hover:text-primary">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="text-sm leading-6 text-muted-foreground line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}
                    <span className="mt-2 text-left text-xs text-muted-foreground transition-colors group-hover:text-primary">
                      阅读 →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* 最近的文章（排除今日新文，避免重复） */}
          <div className="divide-y divide-border border-t border-border pt-2">
            {loading ? (
              <p className="py-4 text-sm text-muted-foreground">加载中…</p>
            ) : loadError ? (
              <div className="py-4 text-sm">
                <p className="text-muted-foreground">文章加载失败。</p>
                <button
                  type="button"
                  onClick={loadPosts}
                  className="mt-1 text-primary hover:underline"
                >
                  重试
                </button>
              </div>
            ) : latest.length === 0 ? (
              todays.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">无文章。</p>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  今天之外暂无更多文章。
                  <Link
                    href="/articles"
                    className="ml-1 text-primary hover:underline"
                  >
                    查看全部归档
                  </Link>
                </p>
              )
            ) : (
              latest.map((post) => (
                <article
                  key={post.slug}
                  className="grid gap-4 py-8 md:grid-cols-[110px_1fr_90px] md:gap-8"
                >
                  <time className="font-mono text-xs text-muted-foreground">
                    {post.date}
                  </time>
                  <div>
                    <div className="mb-3 flex items-center gap-3 text-xs text-primary">
                      <span>{post.category}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-muted-foreground">
                        {post.read}阅读
                      </span>
                    </div>
                    <h3 className="text-xl tracking-tight transition-colors hover:text-primary">
                      <Link href={`/articles/${post.slug}`}>
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                      {post.excerpt}
                    </p>
                  </div>
                  <Link
                    href={`/articles/${post.slug}`}
                    className="text-left text-xs text-muted-foreground transition-colors hover:text-primary md:text-right"
                    aria-label={`阅读《${post.title}》`}
                  >
                    阅读 →
                  </Link>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  )
}
