'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useAuth } from '@/components/use-auth'
import { useToast, type ToastVariant } from '@/components/toast'
import {
  ContentWithToc,
  TocSide,
  type TocHeading,
} from '@/components/content-with-toc'
import { ReadingProgress } from '@/components/reading-progress'
import { CommentList } from '@/components/comment-list'
import { deletePost, incrementView, type Post } from '@/lib/posts'
import { errorMessage, isAuthError, isNotFound } from '@/lib/api-client'

const VIEW_DEDUP_MS = 5 * 60 * 1000 // 5 分钟内重复进入不重复计数

export function ArticleView({
  post: initialPost,
  prev,
  next,
  related = [],
}: {
  post: Post
  prev?: Post
  next?: Post
  related?: Post[]
}) {
  const slug = initialPost.slug
  const router = useRouter()
  const { authed } = useAuth()
  const t = useToast()
  const [post, setPost] = useState<Post>(initialPost)
  const isDraft = (post.status ?? 'published') === 'draft'
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [headings, setHeadings] = useState<TocHeading[]>([])
  const [tocOpen, setTocOpen] = useState(false)

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

  // 真实阅读量 +1：5 分钟去重，fire-and-forget
  // localStorage 被禁用（Safari 隐私模式 / 配额满 / 隐私插件）时退化到每次计数
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((post.status ?? 'published') === 'draft') return // 草稿不计数
    const key = `start:view:${slug}`
    const now = Date.now()
    try {
      const last = Number(localStorage.getItem(key) || '0')
      if (now - last < VIEW_DEDUP_MS) return // 窗口内重复进入不计数
      localStorage.setItem(key, String(now))
    } catch {
      // localStorage 故障：跳过去重，继续计数（不丢阅读量）
    }
    incrementView(slug).then((views) => {
      if (typeof views === 'number') {
        setPost((prev) => (prev ? { ...prev, views } : prev))
      }
    })
  }, [slug])

  // 切文章时清掉残留 headings + 关折叠
  useEffect(() => {
    setHeadings([])
    setTocOpen(false)
  }, [slug])

  const onHeadingsChange = useCallback((h: TocHeading[]) => setHeadings(h), [])

  const onDelete = () => setConfirmOpen(true)

  const onConfirmDelete = async () => {
    setDeleting(true)
    try {
      const title = post.title ?? slug
      await deletePost(slug)
      setConfirmOpen(false)
      setDeleting(false)
      showToast('success', { title: '已删除', description: `《${title}》已移除。` })
      setTimeout(() => router.push('/articles'), 500)
    } catch (err) {
      let msg = errorMessage(err, '删除失败')
      if (isAuthError(err)) msg = '登录已过期，请重新登录'
      if (isNotFound(err)) msg = '文章不存在或已被删除'
      setDeleting(false)
      setConfirmOpen(false)
      showToast('error', { title: msg })
    }
  }

  return (
    <>
      <ReadingProgress />
      <section className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-8 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* 左：正文 */}
        <article className="mx-auto w-full max-w-3xl min-w-0">
          <Link
            href="/articles"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            ← 返回文章列表
          </Link>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-primary">
            <span>{post.category}</span>
            <span className="text-muted-foreground">/</span>
            <time className="font-mono text-muted-foreground">{post.date}</time>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{post.views ?? 0} 阅读</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground">{post.read}</span>
            {headings.length > 0 && (
              <>
                <span className="hidden sm:inline text-muted-foreground">/</span>
                <span className="hidden sm:inline text-muted-foreground">{headings.length} 节</span>
              </>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{post.excerpt}</p>

          {/* 标签 */}
          {(post.tags?.length ?? 0) > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              {post.tags!.map((tag) => (
                <Link
                  key={tag}
                  href={`/articles?tag=${encodeURIComponent(tag)}`}
                  className="border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* 移动端 / 平板：inline 折叠目录（<lg） */}
          {headings.length > 0 && (
            <div className="mt-8 border border-border lg:hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left text-xs text-muted-foreground transition-colors hover:text-primary"
                aria-expanded={tocOpen}
                aria-controls="article-toc-inline"
                onClick={() => setTocOpen((v) => !v)}
              >
                <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground/70">
                  本文目录 · {headings.length} 节
                </span>
                <span aria-hidden="true">{tocOpen ? '−' : '+'}</span>
              </button>
              {tocOpen && (
                <nav
                  id="article-toc-inline"
                  aria-label="目录"
                  className="border-t border-border p-4 text-sm"
                >
                  <ul className="space-y-2">
                    {headings.map((h, idx) => (
                      <li key={`${h.id}-${idx}`}>
                        <a
                          href={`#${h.id}`}
                          onClick={(e) => {
                            e.preventDefault()
                            setTocOpen(false)
                            const el = document.getElementById(h.id)
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }}
                          className={[
                            'block py-0.5 transition-colors hover:text-primary',
                            h.level === 3 ? 'pl-5 text-xs text-muted-foreground' : 'text-foreground/90',
                          ].join(' ')}
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
          )}

          <ContentWithToc content={post.content} onHeadingsChange={onHeadingsChange} className="mt-10" />

          {/* 评论区 */}
          <div className="mt-16">
            <CommentList postSlug={post.slug} />
          </div>

          <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-border pt-8">
            {authed && (
              <>
                <Link
                  href={`/admin/articles/${post.slug}/edit`}
                  className="border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary"
                >
                  编辑
                </Link>
                <Link
                  href="/admin/new"
                  className="border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary"
                >
                  写一篇新的
                </Link>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="border border-border px-3 py-2 text-xs transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                >
                  {deleting ? '删除中…' : '删除'}
                </button>
                <Link
                  href="/admin"
                  className="border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary"
                >
                  前往后台
                </Link>
              </>
            )}
            <Link
              href="/articles"
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              查看全部文章 →
            </Link>
          </div>

          {/* 相关文章（同分类） */}
          {related.length > 0 && (
            <div className="mt-8 border-t border-border pt-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                相关文章
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/articles/${r.slug}`}
                      className="group block border border-border p-4 transition-colors hover:border-primary"
                    >
                      <span className="block text-xs text-muted-foreground">{r.date}</span>
                      <span className="mt-2 block text-sm leading-6 transition-colors group-hover:text-primary">
                        {r.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 上一篇 / 下一篇 */}
          {(prev || next) && (
            <nav className="mt-8 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
              {prev ? (
                <Link
                  href={`/articles/${prev.slug}`}
                  className="group flex flex-col gap-1"
                >
                  <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
                    ← 上一篇
                  </span>
                  <span className="text-sm transition-colors group-hover:text-primary">
                    {prev.title}
                  </span>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link
                  href={`/articles/${next.slug}`}
                  className="group flex flex-col items-end gap-1 text-right"
                >
                  <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
                    下一篇 →
                  </span>
                  <span className="text-sm transition-colors group-hover:text-primary">
                    {next.title}
                  </span>
                </Link>
              ) : (
                <div />
              )}
            </nav>
          )}

          {authed && (
            <ConfirmDialog
              open={confirmOpen}
              title="删除文章"
              description={`确定删除《${post.title}》？此操作不可恢复。`}
              variant="danger"
              confirmText="删除"
              loading={deleting}
              onConfirm={onConfirmDelete}
              onCancel={() => setConfirmOpen(false)}
            />
          )}
        </article>

        {/* 右：桌面 sticky 目录 */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-auto pr-2">
            <TocSide headings={headings} />
          </div>
        </aside>
        </div>
      </section>
    </>
  )
}

export default ArticleView
