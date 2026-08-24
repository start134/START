'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/use-auth'
import { useToast, type ToastVariant } from '@/components/toast'
import { createPost } from '@/lib/posts'

export default function AdminNewPost() {
  const router = useRouter()
  const { authed, loading } = useAuth()
  const t = useToast()
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

  useEffect(() => {
    if (loading) return
    if (!authed) router.replace('/admin/login')
  }, [authed, loading, router])

  const submit = async (status: 'draft' | 'published') => {
    setError('')
    const next: Partial<Record<keyof typeof form, string>> = {}
    if (!form.title.trim()) next.title = '请填写标题'
    if (status === 'published') {
      if (!form.content.trim()) next.content = '请填写正文'
      else if (form.content.trim().length < 10) next.content = '正文至少 10 个字'
    }
    if (form.title.trim().length > 80) next.title = '标题不超过 80 个字'
    if (form.category.trim().length > 16) next.category = '分类不超过 16 个字'
    if (form.excerpt.trim().length > 120) next.excerpt = '摘要不超过 120 个字'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      showToast('error', { title: Object.values(next)[0] || '请检查表单' })
      return
    }
    setSubmitting(true)
    try {
      const post = await createPost({ ...form, status })
      if (status === 'draft') {
        showToast('success', { title: '已存草稿', description: `《${post.title}》已保存为草稿。` })
      } else {
        showToast('success', { title: '发布成功', description: `《${post.title}》已保存。` })
      }
      setTimeout(() => router.push('/admin/articles'), 500)
    } catch (err) {
      let msg = err instanceof Error ? err.message : '保存失败'
      if (msg.includes('401') || msg.includes('登录')) {
        msg = '登录已过期，请重新登录'
        setTimeout(() => router.replace('/admin/login'), 800)
      }
      setError(msg)
      showToast('error', { title: msg })
      setSubmitting(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit('published')
  }

  const saveDraft = () => submit('draft')

  const fieldClass =
    'w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-7 outline-none transition-colors focus:border-primary'

  const errClass = 'mt-1 text-xs text-destructive'

  if (loading || !authed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 lg:px-8">
        <p className="text-sm text-muted-foreground">
          {loading ? '鉴权中…' : '跳转到登录页…'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">写一篇文章</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            写完点发布；没写完也可以存草稿。
          </p>
        </div>
        <Link
          href="/admin/articles"
          className="text-sm text-muted-foreground hover:text-primary"
        >
          ← 返回文章列表
        </Link>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-lg border border-border bg-card p-8">
        <div className="grid gap-2">
          <label htmlFor="title" className="text-sm font-medium text-foreground">
            标题 <span className="text-primary">*</span>
          </label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => {
              setForm({ ...form, title: e.target.value })
              if (errors.title) setErrors({ ...errors, title: undefined })
            }}
            placeholder="给这篇文章起个名字"
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
          <label htmlFor="category" className="text-sm font-medium text-foreground">
            分类
          </label>
          <input
            id="category"
            value={form.category}
            onChange={(e) => {
              setForm({ ...form, category: e.target.value })
              if (errors.category) setErrors({ ...errors, category: undefined })
            }}
            placeholder="例如：设计 / 技术 / 生活"
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
          <label htmlFor="excerpt" className="text-sm font-medium text-foreground">
            摘要
          </label>
          <input
            id="excerpt"
            value={form.excerpt}
            onChange={(e) => {
              setForm({ ...form, excerpt: e.target.value })
              if (errors.excerpt) setErrors({ ...errors, excerpt: undefined })
            }}
            placeholder="一句话概括，留空会自动截取正文"
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
          <label htmlFor="content" className="text-sm font-medium text-foreground">
            正文 <span className="text-primary">*</span>
          </label>
          <textarea
            id="content"
            value={form.content}
            onChange={(e) => {
              setForm({ ...form, content: e.target.value })
              if (errors.content) setErrors({ ...errors, content: undefined })
            }}
            placeholder="段落之间留空行，会保留换行..."
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? '保存中...' : '发布'}
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={submitting}
            className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {submitting ? '保存中...' : '存草稿'}
          </button>
        </div>
      </form>
    </div>
  )
}
