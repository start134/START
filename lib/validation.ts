// 文章输入的服务端校验：与编辑器前端的规则保持一致。
// 任何绕过前端的请求（curl / 异常客户端）到这里都会被拦下，杜绝脏数据入库。
import type { PostInput } from '@/lib/posts-store'

export const POST_LIMITS = {
  title: 80,
  category: 16,
  excerpt: 120,
  contentMax: 100_000,
  contentMinPublished: 10,
  tags: 8,
  tagLen: 20,
} as const

const VALID_STATUS = new Set(['draft', 'published', 'scheduled'])

export type PostValidationResult =
  | { ok: true; value: PostInput }
  | { ok: false; error: string }

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/**
 * 校验并规范化文章输入。
 * mode='create'：title/content 必填（草稿可无正文）；
 * mode='update'：全部字段可选，提供了就按同一套规则校验。
 * baseUpdatedAt：乐观锁版本号，原样透传给存储层。
 */
export function validatePostInput(
  raw: unknown,
  mode: 'create' | 'update'
): PostValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: '请求体格式不正确' }
  }
  const body = raw as Record<string, unknown>
  const L = POST_LIMITS

  // status
  let status: PostInput['status']
  if (body.status !== undefined) {
    const s = asString(body.status)
    if (!s || !VALID_STATUS.has(s)) {
      return { ok: false, error: '状态不合法（只能是 draft / published / scheduled）' }
    }
    status = s as PostInput['status']
  }

  // title
  let title: string | undefined
  if (body.title !== undefined) {
    title = asString(body.title)?.trim()
    if (mode === 'create' && !title) return { ok: false, error: '请填写标题' }
    if (body.title !== undefined && !title) return { ok: false, error: '标题不能为空' }
    if (title && title.length > L.title) {
      return { ok: false, error: `标题不超过 ${L.title} 个字` }
    }
  } else if (mode === 'create') {
    return { ok: false, error: '请填写标题' }
  }

  // content
  let content: string | undefined
  if (body.content !== undefined) {
    if (typeof body.content !== 'string') return { ok: false, error: '正文格式不正确' }
    content = body.content
    if (content.length > L.contentMax) {
      return { ok: false, error: `正文过长（最多 ${L.contentMax} 字）` }
    }
    const effectiveStatus = status ?? (mode === 'update' ? undefined : 'published')
    if (
      effectiveStatus && effectiveStatus !== 'draft' &&
      content.trim().length < L.contentMinPublished
    ) {
      return { ok: false, error: `正文至少 ${L.contentMinPublished} 个字` }
    }
  } else if (mode === 'create' && (status ?? 'published') !== 'draft') {
    return { ok: false, error: '请填写正文' }
  }

  // category / excerpt
  let category: string | undefined
  if (body.category !== undefined) {
    category = asString(body.category)?.trim()
    if (category && category.length > L.category) {
      return { ok: false, error: `分类不超过 ${L.category} 个字` }
    }
  }
  let excerpt: string | undefined
  if (body.excerpt !== undefined) {
    excerpt = asString(body.excerpt)?.trim()
    if (excerpt && excerpt.length > L.excerpt) {
      return { ok: false, error: `摘要不超过 ${L.excerpt} 个字` }
    }
  }

  // tags：字符串数组，去空去重限量限长
  let tags: string[] | undefined
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return { ok: false, error: '标签格式不正确' }
    const cleaned = Array.from(
      new Set(body.tags.map((t) => String(t).trim()).filter(Boolean))
    )
    if (cleaned.length > L.tags) return { ok: false, error: `标签最多 ${L.tags} 个` }
    const tooLong = cleaned.find((t) => t.length > L.tagLen)
    if (tooLong) return { ok: false, error: `标签「${tooLong.slice(0, 20)}」超过 ${L.tagLen} 个字` }
    tags = cleaned
  }

  // publishAt
  let publishAt: string | undefined
  if (body.publishAt !== undefined) {
    const p = asString(body.publishAt)
    if (!p || Number.isNaN(new Date(p).getTime())) {
      return { ok: false, error: '发布时间格式不正确' }
    }
    publishAt = p
  }
  if (mode === 'create' && status === 'scheduled' && !publishAt) {
    return { ok: false, error: '定时发布需要选择发布时间' }
  }

  // 乐观锁版本号（原样透传）
  const baseUpdatedAt = asString(body.baseUpdatedAt)

  const value: PostInput = {
    ...(title !== undefined ? { title } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(excerpt !== undefined ? { excerpt } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(publishAt !== undefined ? { publishAt } : {}),
    ...(baseUpdatedAt !== undefined ? { baseUpdatedAt } : {}),
  }
  return { ok: true, value }
}
