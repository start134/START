'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useAuth } from '@/components/use-auth'
import { useToast, type ToastVariant } from '@/components/toast'
import { deletePost, fetchPosts, type Post } from '@/lib/posts'

export default function ArticlesPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [query, setQuery] = useState(sp.get('q') ?? '')
  const [category, setCategory] = useState<string>(sp.get('category') ?? '')
  const [sort, setSort] = useState<'date' | 'read'>(
    sp.get('sort') === 'read' ? 'read' : 'date'
  )
  const [statusTab, setStatusTab] = useState<'all' | 'published' | 'draft'>('all')
  const [loading, setLoading] = useState(true)
  const { authed } = useAuth()
  const t = useToast()
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const showToast = (
    variant: ToastVariant,
    input: { title: string; description?: string; durationMs?: number }
  ) => {
    try {
      if (variant === 'success' && typeof t.success === 'function') return t.success(input)
      if (variant === 'error' && typeof t.error === 'function') return t.error(input)
      if (variant === 'info' && typeof t.info === 'function') return t.info(input)
      if (typeof t.toast === 'function') return t.toast({ ...input, variant })
    } catch { /* ignore */ }
    return ''
  }

  useEffect(() => {
    fetchPosts().then((p) => {
      setPosts(p)
      setLoading(false)
    })
  }, [])

  // URL 参数 ↔ 本地状态双向同步（用户复制链接打开 / 前进后退都能用）
  useEffect(() => {
    const nextQ = sp.get('q') ?? ''
    const nextCat = sp.get('category') ?? ''
    const nextSort: 'date' | 'read' = sp.get('sort') === 'read' ? 'read' : 'date'
    if (nextQ !== query) setQuery(nextQ)
    if (nextCat !== category) setCategory(nextCat)
    if (nextSort !== sort) setSort(nextSort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp])

  const syncUrl = (next: { q?: string; category?: string; sort?: 'date' | 'read' }) => {
    const params = new URLSearchParams(window.location.search)
    const apply: Record<string, string | undefined> = {
      q: query,
      category,
      sort: sort === 'date' ? undefined : sort, // 默认排序不写进 URL，保持链接干净
      ...next,
    }
    if (apply.sort === 'date') apply.sort = undefined
    for (const [k, v] of Object.entries(apply)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    const qs = params.toString()
    const nextUrl = qs ? `/articles?${qs}` : '/articles'
    router.replace(nextUrl, { scroll: false })
  }

  // 可见文章：非管理员只看已发布，管理员按 Tab 切换
  const visiblePosts = useMemo(() => {
    if (!authed) return posts.filter((p) => (p.status ?? 'published') === 'published')
    if (statusTab === 'all') return posts
    return posts.filter((p) => (p.status ?? 'published') === statusTab)
  }, [posts, authed, statusTab])

  // 所有已出现的分类，按首次出现顺序去重，当前选中项永远排第一
  const categories = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const p of visiblePosts) {
      const c = (p.category || '').trim()
      if (!c || seen.has(c)) continue
      seen.add(c)
      list.push(c)
    }
    if (category && !list.includes(category)) list.unshift(category)
    return list
  }, [visiblePosts, category])

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = visiblePosts
    if (category) out = out.filter((p) => p.category === category)
    if (q) {
      out = out.filter((p) =>
        `${p.title}${p.excerpt}${p.category}`.toLowerCase().includes(q)
      )
    }
    const sorted = [...out]
    if (sort === 'read') {
      const readNum = (s: string) => {
        const m = /(\d+)/.exec(s ?? '')
        return m ? parseInt(m[1], 10) : 0
      }
      sorted.sort((a, b) => {
        const d = readNum(b.read) - readNum(a.read)
        if (d !== 0) return d
        return a.date < b.date ? 1 : -1
      })
    } else {
      sorted.sort((a, b) => (a.date < b.date ? 1 : -1))
    }
    return sorted
  }, [visiblePosts, query, category, sort])

  const sortLabel: Record<'date' | 'read', string> = { date: '最新发布', read: '最多阅读' }

  const onDelete = (slug: string, title: string) => {
    setDeleteTarget({ slug, title })
  }

  const onConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { slug, title } = deleteTarget
      await deletePost(slug)
      setPosts((prev) => prev.filter((p) => p.slug !== slug))
      showToast('success', { title: '已删除', description: `《${title}》已移除。` })
      setDeleting(false)
      setDeleteTarget(null)
    } catch (err) {
      let msg = err instanceof Error ? err.message : '删除失败'
      if (msg.includes('401') || msg.includes('登录')) msg = '登录已过期，请重新登录'
      if (msg.includes('404') || msg.includes('未找到')) {
        msg = '文章不存在或已被删除'
        if (deleteTarget) {
          setPosts((prev) => prev.filter((p) => p.slug !== deleteTarget.slug))
        }
      }
      showToast('error', { title: msg })
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const onToggleStatus = async (post: Post) => {
    const current = post.status ?? 'published'
    const next = current === 'published' ? 'draft' : 'published'
    setToggling(post.slug)
    try {
      const updated = await updatePost(post.slug, { status: next })
      setPosts((prev) =>
        prev.map((p) => (p.slug === post.slug ? { ...p, status: updated.status } : p))
      )
      showToast('success', {
        title: next === 'published' ? '已发布' : '已存草稿',
        description: `《${post.title}》${next === 'published' ? '已公开发布' : '已转为草稿'}`,
      })
    } catch (err) {
      let msg = err instanceof Error ? err.message : '切换失败'
      if (msg.includes('401') || msg.includes('登录')) msg = '登录已过期，请重新登录'
      showToast('error', { title: msg })
    } finally {
      setToggling(null)
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-16 lg:px-8 lg:py-24">
      <p className="font-mono text-xs tracking-[0.2em] text-primary">全部文章</p>
      <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl">文章</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        所有已发布的内容，排序可切换。
      </p>

      {authed && (
        <div className="mt-8 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">状态：</span>
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusTab(s)}
              className={`border px-3 py-1 transition-colors ${
                statusTab === s
                  ? s === 'draft'
                    ? 'border-amber-500/40 text-amber-400'
                    : 'border-primary text-primary'
                  : 'border-border text-muted-foreground hover:border-primary'
              }`}
            >
              {s === 'all' ? '全部' : s === 'published' ? '已发布' : '草稿'}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 flex w-full max-w-sm items-center gap-2 border-b border-border pb-2 text-sm text-muted-foreground focus-within:border-primary">
        <span aria-hidden="true">⌕</span>
        <label htmlFor="search" className="sr-only">
          搜索文章
        </label>
        <input
          id="search"
          value={query}
          onChange={(event) => {
            const v = event.target.value
            setQuery(v)
            syncUrl({ q: v })
          }}
          placeholder="搜索文章"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              syncUrl({ q: '' })
            }}
            aria-label="清除搜索"
            className="text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            ✕
          </button>
        ) : null}
      </div>

      {categories.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">分类：</span>
          <button
            type="button"
            onClick={() => {
              setCategory('')
              syncUrl({ category: '' })
            }}
            className={
              !category
                ? 'border border-primary bg-primary/10 px-3 py-1.5 text-primary transition-colors'
                : 'border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary'
            }
          >
            全部
          </button>
          {categories.map((c) => {
            const active = c === category
            return (
              <button
                type="button"
                key={c}
                onClick={() => {
                  setCategory(c)
                  syncUrl({ category: c })
                }}
                className={
                  active
                    ? 'border border-primary bg-primary/10 px-3 py-1.5 text-primary transition-colors'
                    : 'border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary'
                }
              >
                {c}
              </button>
            )
          })}
          {(category || query || sort !== 'date') && (
            <button
              type="button"
              onClick={() => {
                setCategory('')
                setQuery('')
                setSort('date')
                syncUrl({ category: '', q: '', sort: 'date' })
              }}
              className="ml-1 px-3 py-1.5 text-muted-foreground transition-colors hover:text-primary"
            >
              重置筛选
            </button>
          )}
        </div>
      )}

      {/* 排序 chip */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">排序：</span>
        {(['date', 'read'] as const).map((k) => {
          const active = sort === k
          return (
            <button
              type="button"
              key={k}
              onClick={() => {
                setSort(k)
                syncUrl({ sort: k })
              }}
              className={
                active
                  ? 'border border-primary bg-primary/10 px-3 py-1.5 text-primary transition-colors'
                  : 'border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary'
              }
            >
              {sortLabel[k]}
            </button>
          )
        })}
      </div>

      {!loading && (category || query || sort !== 'date') && (
        <p className="mt-6 text-xs text-muted-foreground">
          共找到 {filteredSorted.length} 篇 · 排序「{sortLabel[sort]}」
          {category ? <> · 分类「<span className="text-primary">{category}</span>」</> : null}
          {query ? <> · 关键词「<span className="text-foreground">{query}</span>」</> : null}
        </p>
      )}

      <div className="mt-6 divide-y divide-border md:mt-10">
        {loading ? (
          <p className="py-10 text-sm text-muted-foreground">加载中…</p>
        ) : filteredSorted.length === 0 ? (
          <p className="py-10 text-sm text-muted-foreground">
            没有找到相关文章。
            {(query || category || sort !== 'date') && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setCategory('')
                    setSort('date')
                    syncUrl({ q: '', category: '', sort: 'date' })
                  }}
                  className="text-primary hover:underline"
                >
                  清空筛选
                </button>
              </>
            )}
            {!query && !category && sort === 'date' && authed && (
              <>
                ，<Link href="/admin/new" className="text-primary hover:underline">去写第一篇</Link>
              </>
            )}
          </p>
        ) : (
          filteredSorted.map((post) => (
            <article
              key={post.slug}
              className="grid gap-4 py-8 md:grid-cols-[110px_1fr_120px] md:gap-8"
            >
              <time className="font-mono text-xs text-muted-foreground">{post.date}</time>
              <div>
                <div className="mb-3 flex items-center gap-3 text-xs text-primary">
                  <span>{post.category}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">{post.read}阅读</span>
                </div>
                <h3 className="text-xl tracking-tight transition-colors hover:text-primary">
                  <Link href={`/articles/${post.slug}`}>{post.title}</Link>
                  {(post.status ?? 'published') === 'draft' && (
                    <span className="ml-2 border border-amber-500/40 px-1.5 py-0.5 align-middle text-[10px] text-amber-400">
                      草稿
                    </span>
                  )}
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  {post.excerpt}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-xs text-muted-foreground md:items-end">
                <Link
                  href={`/articles/${post.slug}`}
                  className="transition-colors hover:text-primary"
                  aria-label={`阅读《${post.title}》`}
                >
                  阅读 →
                </Link>
                {authed && (
                  <>
                    <Link
                      href={`/admin/articles/${post.slug}/edit`}
                      className="transition-colors hover:text-primary"
                    >
                      编辑
                    </Link>
                    <button
                      type="button"
                      onClick={() => onToggleStatus(post)}
                      disabled={toggling === post.slug}
                      className="text-left transition-colors hover:text-amber-400 disabled:opacity-50 md:text-right"
                    >
                      {toggling === post.slug
                        ? '切换中…'
                        : (post.status ?? 'published') === 'published'
                          ? '转草稿'
                          : '发布'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(post.slug, post.title)}
                      className="text-left transition-colors hover:text-destructive md:text-right"
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="mt-10">
        {authed && (
          <Link
            href="/admin"
            className="border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            前往管理后台
          </Link>
        )}
      </div>

      {authed && (
        <ConfirmDialog
          open={!!deleteTarget}
          title="删除文章"
          description={deleteTarget ? `确定删除《${deleteTarget.title}》？此操作不可恢复。` : undefined}
          variant="danger"
          confirmText="删除"
          loading={deleting}
          onConfirm={onConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  )
}
