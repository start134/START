'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast, type ToastVariant } from '@/components/toast'
import { ContentWithToc } from '@/components/content-with-toc'
import { createPost, fetchPosts, updatePost, uploadImage, type Post } from '@/lib/posts'
import { ApiError, errorMessage, isAuthError } from '@/lib/api-client'

export type EditorStatus = 'draft' | 'published' | 'scheduled'

type EditorForm = {
  title: string
  category: string
  tags: string
  excerpt: string
  content: string
  status: EditorStatus
  publishAt: string // datetime-local 格式；提交时转 ISO
}

const MAX_TITLE = 80
const MAX_CATEGORY = 16
const MAX_EXCERPT = 120
const MAX_TAGS = 8
const MAX_TAG_LEN = 20
const AUTOSAVE_DEBOUNCE_MS = 800

function toLocalInputValue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseTags(raw: string): { tags: string[]; error?: string } {
  const tags = Array.from(
    new Set(
      raw
        .split(/[,，、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  )
  if (tags.length > MAX_TAGS) return { tags, error: `标签最多 ${MAX_TAGS} 个` }
  const tooLong = tags.find((t) => t.length > MAX_TAG_LEN)
  if (tooLong) return { tags, error: `标签「${tooLong}」超过 ${MAX_TAG_LEN} 个字` }
  return { tags }
}

type ArticleEditorProps = {
  mode: 'create' | 'edit'
  slug?: string
  /** 编辑模式下传入已加载的文章 */
  post?: Post
  backHref: string
  backLabel: string
  kicker: string
  title: string
  intro: string
  /** 未登录跳转目标（由页面决定前台/后台登录页） */
  loginRedirect: string
}

/**
 * 文章编辑器（新建/编辑共用）：
 *  - 实时预览（编辑 / 预览页签，渲染逻辑与前台一致）
 *  - 本地自动保存（localStorage，800ms 防抖），误关页面可恢复
 *  - 插图：粘贴 / 拖拽 / 点按钮上传到 /api/admin/upload
 *  - 标签（逗号分隔）、定时发布（到点由服务端懒提升转正）
 */
export function ArticleEditor({
  mode,
  slug,
  post,
  backHref,
  backLabel,
  kicker,
  title,
  intro,
  loginRedirect,
}: ArticleEditorProps) {
  const router = useRouter()
  const t = useToast()

  const initialForm = useMemo<EditorForm>(() => {
    if (mode === 'edit' && post) {
      return {
        title: post.title,
        category: post.category,
        tags: (post.tags ?? []).join(', '),
        excerpt: post.excerpt,
        content: post.content,
        status: (post.status ?? 'published') as EditorStatus,
        publishAt: toLocalInputValue(post.publishAt),
      }
    }
    return {
      title: '',
      category: '',
      tags: '',
      excerpt: '',
      content: '',
      status: 'published',
      publishAt: '',
    }
    // 初始表单只随挂载计算一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [form, setForm] = useState<EditorForm>(initialForm)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof EditorForm | 'tags' | 'publishAt', string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  // 已有分类/标签：datalist 建议（可自由输入，但优先选已有的，避免拼错产生重复分类）
  const [knownCategories, setKnownCategories] = useState<string[]>([])
  const [knownTags, setKnownTags] = useState<string[]>([])

  useEffect(() => {
    fetchPosts()
      .then((posts) => {
        const cats = new Set<string>()
        const tags = new Set<string>()
        for (const p of posts) {
          if (p.category) cats.add(p.category)
          for (const tg of p.tags ?? []) tags.add(tg)
        }
        setKnownCategories(Array.from(cats).sort())
        setKnownTags(Array.from(tags).sort())
      })
      .catch(() => {
        // 拿不到已有分类也不影响写作
      })
  }, [])

  const showToast = useCallback(
    (variant: ToastVariant, input: { title: string; description?: string; durationMs?: number }) => {
      try {
        if (variant === 'success' && typeof t.success === 'function') return t.success(input)
        if (variant === 'error' && typeof t.error === 'function') return t.error(input)
        if (variant === 'info' && typeof t.info === 'function') return t.info(input)
        if (typeof t.toast === 'function') return t.toast({ ...input, variant })
      } catch {
        /* ignore */
      }
      return ''
    },
    [t]
  )

  // ---- 本地自动保存 / 恢复 ----------------------------------------------

  const draftKey = `start:editor-draft:${mode}:${mode === 'edit' ? slug : 'new'}`
  const [restoreDraft, setRestoreDraft] = useState<{ form: EditorForm; savedAt: number } | null>(null)

  const formEquals = useCallback(
    (a: EditorForm, b: EditorForm) =>
      a.title === b.title &&
      a.category === b.category &&
      a.tags === b.tags &&
      a.excerpt === b.excerpt &&
      a.content === b.content &&
      a.status === b.status &&
      a.publishAt === b.publishAt,
    []
  )

  // 挂载时检查有没有未保存的本地草稿
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const saved = JSON.parse(raw) as { form?: EditorForm; savedAt?: number }
      if (saved?.form && !formEquals(saved.form, initialForm)) {
        setRestoreDraft({ form: saved.form, savedAt: saved.savedAt ?? Date.now() })
      }
    } catch {
      // localStorage 不可用或内容损坏：忽略
    }
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 表单变化 800ms 后落盘
  useEffect(() => {
    if (submittedRef.current) return
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ form, savedAt: Date.now() }))
      } catch {
        // 配额满 / 隐私模式：自动保存不可用，静默
      }
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [form, draftKey])

  const clearLocalDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey)
    } catch {
      /* ignore */
    }
  }, [draftKey])

  const onRestoreDraft = () => {
    if (!restoreDraft) return
    setForm(restoreDraft.form)
    setRestoreDraft(null)
    showToast('info', { title: '已恢复本地草稿' })
  }

  const onDiscardDraft = () => {
    clearLocalDraft()
    setRestoreDraft(null)
  }

  // ---- 插图上传 ---------------------------------------------------------

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = contentRef.current
      setForm((prev) => {
        if (!el) return { ...prev, content: prev.content + text }
        const start = el.selectionStart ?? prev.content.length
        const end = el.selectionEnd ?? start
        return {
          ...prev,
          content: prev.content.slice(0, start) + text + prev.content.slice(end),
        }
      })
      requestAnimationFrame(() => {
        const target = contentRef.current
        if (!target) return
        target.focus()
        const pos = (el?.selectionStart ?? 0) + text.length
        target.setSelectionRange(pos, pos)
      })
    },
    []
  )

  const handleImageFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) return
      setUploading(true)
      for (const file of images) {
        try {
          const url = await uploadImage(file)
          insertAtCursor(`\n![](${url})\n`)
          showToast('success', { title: '图片已上传', description: url })
        } catch (err) {
          const msg = err instanceof Error ? err.message : '图片上传失败'
          showToast('error', { title: msg })
        }
      }
      setUploading(false)
    },
    [insertAtCursor, showToast]
  )

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (files.length === 0) return
    e.preventDefault()
    handleImageFiles(files)
  }

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length === 0) return
    e.preventDefault()
    handleImageFiles(files)
  }

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await handleImageFiles(files)
  }

  // ---- 校验 / 提交 ------------------------------------------------------

  const validate = (): string | null => {
    if (!form.title.trim()) return '请填写标题'
    if (form.title.trim().length > MAX_TITLE) return '标题不超过 80 个字'
    if (form.category.trim().length > MAX_CATEGORY) return '分类不超过 16 个字'
    if (form.excerpt.trim().length > MAX_EXCERPT) return '摘要不超过 120 个字'
    const { tags, error: tagErr } = parseTags(form.tags)
    if (tagErr) return tagErr
    if (form.status !== 'draft') {
      if (!form.content.trim()) return '请填写正文'
      if (form.content.trim().length < 10) return '正文至少 10 个字'
    }
    if (form.status === 'scheduled') {
      if (!form.publishAt) return '定时发布需要选择发布时间'
      if (new Date(form.publishAt).getTime() <= Date.now()) return '发布时间必须是未来'
    }
    return null
  }

  const submit = async () => {
    setError('')
    const problem = validate()
    if (problem) {
      showToast('error', { title: problem })
      setError(problem)
      return
    }
    setSubmitting(true)
    const { tags } = parseTags(form.tags)
    const payload = {
      title: form.title.trim(),
      category: form.category.trim(),
      excerpt: form.excerpt.trim(),
      content: form.content,
      status: form.status,
      tags,
      publishAt:
        form.status === 'scheduled' && form.publishAt
          ? new Date(form.publishAt).toISOString()
          : undefined,
      // 乐观锁：带上加载时的版本号，其他窗口先保存过则服务端返回 409
      ...(mode === 'edit' && post?.updatedAt ? { baseUpdatedAt: post.updatedAt } : {}),
    }
    try {
      submittedRef.current = true
      const saved =
        mode === 'edit' && slug
          ? await updatePost(slug, payload)
          : await createPost(payload)
      clearLocalDraft()
      const isScheduled = saved.status === 'scheduled'
      showToast('success', {
        title: isScheduled
          ? '定时发布已设置'
          : saved.status === 'draft'
            ? '已存草稿'
            : '发布成功',
        description:
          isScheduled
            ? `《${saved.title}》将在设定时间自动发布。`
            : `《${saved.title}》已保存。`,
      })
      setTimeout(() => router.push(`/articles/${saved.slug}`), 400)
    } catch (err) {
      submittedRef.current = false
      let msg = errorMessage(err, '保存失败')
      if (isAuthError(err)) {
        msg = '登录已过期，请重新登录'
        setTimeout(() => router.replace(loginRedirect), 800)
      } else if (err instanceof ApiError && err.status === 409) {
        msg = '这篇文章已被其他窗口修改并保存，你的修改没有覆盖它。请刷新页面获取最新内容后再编辑。'
      }
      setError(msg)
      showToast('error', { title: msg, durationMs: 6000 })
      setSubmitting(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit()
  }

  // ---- 渲染 --------------------------------------------------------------

  const fieldClass =
    'w-full border-b border-border bg-transparent pb-2 text-sm leading-7 outline-none transition-colors focus:border-primary'
  const errClass = 'mt-1 text-xs text-destructive'

  const statusChips: { value: EditorStatus; label: string; activeClass: string }[] = [
    {
      value: 'published',
      label: '已发布',
      activeClass: 'border-primary text-primary',
    },
    {
      value: 'draft',
      label: '草稿',
      activeClass: 'border-amber-500/40 text-amber-400',
    },
    {
      value: 'scheduled',
      label: '定时',
      activeClass: 'border-sky-500/40 text-sky-400',
    },
  ]

  const submitLabel =
    mode === 'edit'
      ? submitting
        ? '保存中…'
        : '保存修改'
      : submitting
        ? '保存中…'
        : form.status === 'draft'
          ? '存草稿'
          : form.status === 'scheduled'
            ? '定时发布'
            : '发布'

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 lg:px-8 lg:py-24">
      {mode === 'edit' && slug && (
        <Link
          href={`/articles/${slug}`}
          className="text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          ← 返回文章
        </Link>
      )}
      <p className="mt-6 font-mono text-xs tracking-[0.2em] text-primary">{kicker}</p>
      <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 text-sm text-muted-foreground">{intro}</p>

      {restoreDraft && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <span className="text-foreground/90">
            检测到未保存的本地草稿（{new Date(restoreDraft.savedAt).toLocaleString('zh-CN')}），要恢复吗？
          </span>
          <span className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={onRestoreDraft}
              className="border border-primary px-3 py-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              恢复
            </button>
            <button
              type="button"
              onClick={onDiscardDraft}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              放弃
            </button>
          </span>
        </div>
      )}

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
            placeholder="给这篇文章起个名字"
            className={`${fieldClass} ${errors.title ? 'border-destructive' : ''}`}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'title-error' : undefined}
          />
          {errors.title && <p id="title-error" className={errClass}>{errors.title}</p>}
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="category" className="text-xs text-muted-foreground">
              分类
            </label>
            <input
              id="category"
              list="editor-category-list"
              value={form.category}
              onChange={(e) => {
                setForm({ ...form, category: e.target.value })
                if (errors.category) setErrors({ ...errors, category: undefined })
              }}
              placeholder="例如：设计 / 技术 / 生活"
              className={`${fieldClass} ${errors.category ? 'border-destructive' : ''}`}
            />
            <datalist id="editor-category-list">
              {knownCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {errors.category && <p className={errClass}>{errors.category}</p>}
          </div>
          <div className="grid gap-2">
            <label htmlFor="tags" className="text-xs text-muted-foreground">
              标签 <span className="text-muted-foreground/60">（逗号分隔，最多 {MAX_TAGS} 个）</span>
            </label>
            <input
              id="tags"
              list="editor-tag-list"
              value={form.tags}
              onChange={(e) => {
                setForm({ ...form, tags: e.target.value })
                if (errors.tags) setErrors({ ...errors, tags: undefined })
              }}
              placeholder="例如：UI, 随笔, Next.js"
              className={`${fieldClass} ${errors.tags ? 'border-destructive' : ''}`}
            />
            <datalist id="editor-tag-list">
              {knownTags.map((tg) => (
                <option key={tg} value={tg} />
              ))}
            </datalist>
            {errors.tags && <p className={errClass}>{errors.tags}</p>}
          </div>
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
            placeholder="一句话概括，留空会自动截取正文"
            className={`${fieldClass} ${errors.excerpt ? 'border-destructive' : ''}`}
          />
          {errors.excerpt && <p className={errClass}>{errors.excerpt}</p>}
        </div>

        <div className="grid gap-3">
          <label className="text-xs text-muted-foreground">状态</label>
          <div className="flex flex-wrap gap-2">
            {statusChips.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setForm({ ...form, status: s.value })}
                className={`border px-3 py-1.5 text-xs transition-colors ${
                  form.status === s.value
                    ? s.activeClass
                    : 'border-border text-muted-foreground hover:border-primary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {form.status === 'scheduled' && (
            <div className="grid gap-2">
              <label htmlFor="publishAt" className="text-xs text-muted-foreground">
                发布时间 <span className="text-primary">*</span>
                <span className="ml-2 text-muted-foreground/60">到点后文章自动公开（有人访问时转正）</span>
              </label>
              <input
                id="publishAt"
                type="datetime-local"
                value={form.publishAt}
                onChange={(e) => {
                  setForm({ ...form, publishAt: e.target.value })
                  if (errors.publishAt) setErrors({ ...errors, publishAt: undefined })
                }}
                className={`${fieldClass} ${errors.publishAt ? 'border-destructive' : ''}`}
              />
              {errors.publishAt && <p className={errClass}>{errors.publishAt}</p>}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="content" className="text-xs text-muted-foreground">
              正文 <span className="text-primary">*</span>
            </label>
            <div className="flex items-center gap-3 text-xs">
              {uploading && <span className="text-sky-400">图片上传中…</span>}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                🖼 插入图片
              </button>
              <span className="flex overflow-hidden border border-border">
                {(['edit', 'preview'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`px-3 py-1 transition-colors ${
                      tab === k
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-primary'
                    }`}
                  >
                    {k === 'edit' ? '编辑' : '预览'}
                  </button>
                ))}
              </span>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={onPickImage}
            />
          </div>
          {tab === 'edit' ? (
            <textarea
              id="content"
              ref={contentRef}
              value={form.content}
              onChange={(e) => {
                setForm({ ...form, content: e.target.value })
                if (errors.content) setErrors({ ...errors, content: undefined })
              }}
              onPaste={onPaste}
              onDrop={onDrop}
              placeholder="支持 Markdown。可以直接把图片粘贴或拖进来，会自动上传并插入…"
              rows={14}
              className={`resize-y ${fieldClass} ${errors.content ? 'border-destructive' : ''}`}
              aria-invalid={!!errors.content}
              aria-describedby={errors.content ? 'content-error' : undefined}
            />
          ) : (
            <div className="min-h-[16rem] border border-border bg-card/40 p-5">
              {form.content.trim() ? (
                <ContentWithToc content={form.content} />
              ) : (
                <p className="text-sm text-muted-foreground">正文为空，切换到「编辑」开始写作。</p>
              )}
            </div>
          )}
          {errors.content && <p id="content-error" className={errClass}>{errors.content}</p>}
          <p className="text-xs text-muted-foreground/60">
            编辑内容每 {AUTOSAVE_DEBOUNCE_MS / 1000} 秒自动保存在本机浏览器，误关页面可恢复。
          </p>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="border border-primary px-4 py-2 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            {submitLabel}
          </button>
          <Link
            href={backHref}
            className="text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            {backLabel}
          </Link>
        </div>
      </form>
    </section>
  )
}

export default ArticleEditor
