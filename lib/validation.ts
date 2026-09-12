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
    // 类型不对必须明确报错。旧写法用 asString() 兜底，非字符串会退化成 undefined，
    // 再被"不能为空"的规则吞掉，调用方拿到的是"标题不能为空"这种指错方向的提示。
    if (typeof body.title !== 'string') return { ok: false, error: '标题格式不正确' }
    title = body.title.trim()
    if (!title) {
      return { ok: false, error: mode === 'create' ? '请填写标题' : '标题不能为空' }
    }
    if (title.length > L.title) {
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
    // 未显式声明 status 时按最严格的 published 处理（失败关闭）。
    // 旧写法在 update 模式下把 effectiveStatus 置为 undefined，`effectiveStatus && ...` 直接短路，
    // 整条长度校验被跳过 —— PATCH {"content": ""} 就能把已发布文章的正文清空。
    // 想保留草稿必须显式传 status: 'draft'（编辑器每次保存都会带上 status）。
    const effectiveStatus = status ?? 'published'
    if (effectiveStatus !== 'draft' && content.trim().length < L.contentMinPublished) {
      return { ok: false, error: `正文至少 ${L.contentMinPublished} 个字` }
    }
  } else if (mode === 'create' && (status ?? 'published') !== 'draft') {
    return { ok: false, error: '请填写正文' }
  }

  // category / excerpt
  // 这两个字段旧写法用 asString() 静默兜底：传数字/对象会退化成 undefined，
  // 随后在组装 value 时被整体省略，请求返回 200 但字段根本没更新，调用方误以为改成功。
  let category: string | undefined
  if (body.category !== undefined) {
    if (typeof body.category !== 'string') return { ok: false, error: '分类格式不正确' }
    category = body.category.trim()
    if (category.length > L.category) {
      return { ok: false, error: `分类不超过 ${L.category} 个字` }
    }
  }
  let excerpt: string | undefined
  if (body.excerpt !== undefined) {
    if (typeof body.excerpt !== 'string') return { ok: false, error: '摘要格式不正确' }
    excerpt = body.excerpt.trim()
    if (excerpt.length > L.excerpt) {
      return { ok: false, error: `摘要不超过 ${L.excerpt} 个字` }
    }
  }

  // tags：字符串数组，去空去重限量限长
  let tags: string[] | undefined
  if (body.tags !== undefined) {
    const rawTags = body.tags
    if (!Array.isArray(rawTags) || !rawTags.every((tag): tag is string => typeof tag === 'string')) {
      return { ok: false, error: '标签必须是字符串数组' }
    }
    const cleaned = Array.from(
      new Set(rawTags.map((tag) => tag.trim()).filter(Boolean))
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
  // create 时在这里就能判定；update 时当前文章的 publishAt 只有存储层看得到，
  // 所以"置为 scheduled 却没有发布时间"由 posts-store.updatePost 兜底抛 PostInputError。
  if (mode === 'create' && status === 'scheduled' && !publishAt) {
    return { ok: false, error: '定时发布需要选择发布时间' }
  }

  // 乐观锁版本号（原样透传）。
  // 必须是字符串；空串按"未提供"处理——否则它会与 current.updatedAt 恒不相等，
  // 让每一次保存都误报 409 冲突。
  if (body.baseUpdatedAt !== undefined && typeof body.baseUpdatedAt !== 'string') {
    return { ok: false, error: 'baseUpdatedAt 格式不正确' }
  }
  const baseUpdatedAt = asString(body.baseUpdatedAt)?.trim() || undefined

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
