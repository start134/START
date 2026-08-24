'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/use-auth'
import { useToast, type ToastVariant } from '@/components/toast'
import { fetchPost, updatePost, type Post } from '@/lib/posts'

export default function EditPostPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()
  const { authed, loading: authLoading } = useAuth()
  const t = useToast()
  const [post, setPost] = useState<Post | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [form, setForm] = useState({
    title: '',
    category: '',
    excerpt: '',
    content: '',
    status: 'published' as 'draft' | 'published',
  })
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [submitting, setSubmitting] = useState(false)

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

  // 未登录跳登录页，登录成功再回来
  useEffect(() => {
    if (authLoading) return
    if (!authed) router.replace(`/login?next=/articles/${slug}/edit`)
  }, [authed, authLoading, router, slug])

  useEffect(() => {
    if (authLoading || !authed) return
    fetchPost(slug).then((p) => {
      setPost(p)
      if (p) {
        setForm({
          title: p.title,
          category: p.category,
          excerpt: p.excerpt,
          content: p.content,
          status: (p.status ?? 'published') as 'draft' | 'published',
        })
      }
      setReady(true)
    })
  }, [slug, authed, authLoading])

  const validate = (): boolean => {
    const next: Partial<Record<keyof typeof form, string>> = {}
    if (!form.title.trim()) next.title = '请填写标题'
    if (!form.content.trim()) next.content = '请填写正文'
    else if (form.content.trim().length < 10) next.content = '正文至少 10 个字'
    if (form.title.trim().length > 80) next.title = '标题不超过 80 个字'
    if (form.category.trim().length > 16) next.category = '分类不超过 16 个字'
    if (form.excerpt.trim().length > 120) next.excerpt = '摘要不超过 120 个字'
    setErrors(next)
    const ok = Object.keys(next).length === 0
    if (!ok) {
      const first = Object.values(next)[0]
      showToast('error', { title: first || '请检查表单' })
    }
    return ok
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      await updatePost(slug, form)
      showToast('success', { title: form.status === 'draft' ? '已存草稿' : '保存成功', description: '已更新到服务端。' })
      setTimeout(() => router.push(`/articles/${slug}`), 400)
    } catch (err) {
      let msg = err instanceof Error ? err.message : '更新失败'
      if (msg.includes('401') || msg.includes('登录')) {
        msg = '登录已过期，请重新登录'
        setTimeout(() => router.replace(`/login?next=/articles/${slug}/edit`), 800)
      }
      if (msg.includes('404') || msg.includes('未找到')) {
        msg = '文章不存在或已被删除'
        setTimeout(() => router.replace('/articles'), 800)
      }
      setError(msg)
      showToast('error', { title: msg })
      setSubmitting(false)
    }
  }

  const fieldClass =
    'w-full border-b border-border bg-transparent pb-2 text-sm leading-7 outline-none transition-colors focus:border-primary'
  const errClass = 'mt-1 text-xs text-destructive'

  if (authLoading || !authed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="text-sm text-muted-foreground">
          {authLoading ? '鉴权中…' : '跳转到登录页…'}
        </p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="font-mono text-xs tracking-[0.2em] text-primary">未找到</p>
        <h1 className="mt-3 text-3xl tracking-tight">文章不存在</h1>
        <Link
          href="/articles"
          className="mt-8 inline-block text-sm text-muted-foreground hover:text-primary"
        >
          ← 返回文章列表
        </Link>
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 lg:px-8 lg:py-24">
      <Link
        href={`/articles/${slug}`}
        className="text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        ← 返回文章
      </Link>
      <p className="mt-6 font-mono text-xs tracking-[0.2em] text-primary">编辑模式</p>
      <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl">编辑文章</h1>

      <form onSubmit={onSubmit} noValidate className="mt-10 grid gap-8">
        <div className="grid gap-2">
          <label htmlFor="title" className="text-xs text-muted-foreground">
            标题 <span className="text-primary">*</span>
          </label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => {
              setForm({ ...form, title: e.target.value })
              if (errors.title) setErrors({ ...errors, title: undefined })
            }}
            className={`${fieldClass} ${errors.title ? 'border-destructive' : ''}`}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'title-error' : undefined}
          />
          {errors.title && (
            <p id="title-error" className={errClass}>
              {errors.title}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <label htmlFor="category" className="text-xs text-muted-foreground">
            分类
          </label>
          <input
            id="category"
            value={form.category}
            onChange={(e) => {
              setForm({ ...form, category: e.target.value })
              if (errors.category) setErrors({ ...errors, category: undefined })
            }}
            className={`${fieldClass} ${errors.category ? 'border-destructive' : ''}`}
            aria-invalid={!!errors.category}
            aria-describedby={errors.category ? 'category-error' : undefined}
          />
          {errors.category && (
            <p id="category-error" className={errClass}>
              {errors.category}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <label htmlFor="excerpt" className="text-xs text-muted-foreground">
            摘要
          </label>
          <input
            id="excerpt"
            value={form.excerpt}
            onChange={(e) => {
              setForm({ ...form, excerpt: e.target.value })
              if (errors.excerpt) setErrors({ ...errors, excerpt: undefined })
            }}
            className={`${fieldClass} ${errors.excerpt ? 'border-destructive' : ''}`}
            aria-invalid={!!errors.excerpt}
            aria-describedby={errors.excerpt ? 'excerpt-error' : undefined}
          />
          {errors.excerpt && (
            <p id="excerpt-error" className={errClass}>
              {errors.excerpt}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-muted-foreground">状态</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, status: 'published' })}
              className={`border px-3 py-1.5 text-xs transition-colors ${
                form.status === 'published'
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground hover:border-primary'
              }`}
            >
              已发布
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, status: 'draft' })}
              className={`border px-3 py-1.5 text-xs transition-colors ${
                form.status === 'draft'
                  ? 'border-amber-500/40 text-amber-400'
                  : 'border-border text-muted-foreground hover:border-amber-500/40'
              }`}
            >
              草稿
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <label htmlFor="content" className="text-xs text-muted-foreground">
            正文 <span className="text-primary">*</span>
          </label>
          <textarea
            id="content"
            value={form.content}
            onChange={(e) => {
              setForm({ ...form, content: e.target.value })
              if (errors.content) setErrors({ ...errors, content: undefined })
            }}
            rows={12}
            className={`resize-y ${fieldClass} ${errors.content ? 'border-destructive' : ''}`}
            aria-invalid={!!errors.content}
            aria-describedby={errors.content ? 'content-error' : undefined}
          />
          {errors.content && (
            <p id="content-error" className={errClass}>
              {errors.content}
            </p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="border border-border px-4 py-2 text-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {submitting ? '保存中…' : '保存修改'}
          </button>
          <Link
            href={`/articles/${slug}`}
            className="text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            取消
          </Link>
        </div>
      </form>
    </section>
  )
}
