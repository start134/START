import { NextResponse, after, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import {
  createComment,
  readComment,
  readCommentsByPost,
  toPublicComment,
} from '@/lib/comments-store'
import { createNotification } from '@/lib/notifications-store'
import { isPublishedPost, readPost } from '@/lib/posts-store'
import { getClientIp, hitRateLimit } from '@/lib/rate-limit'

const log = createLogger('api/comments')

// 防刷上限：内容长度、昵称/邮箱长度、单 IP 提交频率
const MAX_CONTENT_LEN = 2000
const MAX_NAME_LEN = 50
const MAX_EMAIL_LEN = 200
const COMMENT_RATE_LIMIT = 5 // 每 10 分钟最多 5 条
const COMMENT_RATE_WINDOW_MS = 10 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(request: NextRequest) {
  const postSlug = request.nextUrl.searchParams.get('postSlug')
  if (!postSlug) {
    return NextResponse.json({ error: '缺少 postSlug 参数' }, { status: 400 })
  }

  try {
    const post = await readPost(postSlug)
    if (!post || !isPublishedPost(post)) {
      return NextResponse.json({ error: '文章不存在或未发布' }, { status: 404 })
    }
    const comments = await readCommentsByPost(postSlug)
    // 邮箱是隐私信息，只进管理端，公开列表一律剥离
    const publicComments = comments.map(toPublicComment)
    log.debug('获取评论成功', { postSlug, count: publicComments.length })
    return NextResponse.json(publicComments)
  } catch (err) {
    log.error('获取评论失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  log.debug('收到请求：POST /api/comments')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: '请求参数格式不正确' }, { status: 400 })
  }
  const { postSlug, name, content, parentId, email } = body as Record<string, unknown>
  if (typeof postSlug !== 'string' || !postSlug.trim() || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: '文章ID和评论内容不能为空' }, { status: 400 })
  }
  const normalizedPostSlug = postSlug.trim()
  const normalizedContent = content.trim()
  const normalizedName = typeof name === 'string' ? name.trim() : undefined
  const normalizedEmail = typeof email === 'string' ? email.trim() : undefined
  const normalizedParentId = typeof parentId === 'string' ? parentId.trim() : undefined

  if (name !== undefined && typeof name !== 'string') {
    return NextResponse.json({ error: '昵称格式不正确' }, { status: 400 })
  }
  if (email !== undefined && typeof email !== 'string') {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
  }
  if (parentId !== undefined && (typeof parentId !== 'string' || !normalizedParentId)) {
    return NextResponse.json({ error: 'parentId 不合法' }, { status: 400 })
  }
  if (normalizedContent.length > MAX_CONTENT_LEN) {
    return NextResponse.json(
      { error: `评论内容过长（最多 ${MAX_CONTENT_LEN} 字）` },
      { status: 400 }
    )
  }
  if (normalizedName && normalizedName.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: '昵称过长' }, { status: 400 })
  }
  if (normalizedEmail && (normalizedEmail.length > MAX_EMAIL_LEN || !EMAIL_RE.test(normalizedEmail))) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
  }

  try {
    // 只允许对已发布的文章评论
    const post = await readPost(normalizedPostSlug)
    if (!post || !isPublishedPost(post)) {
      return NextResponse.json({ error: '文章不存在或未发布' }, { status: 404 })
    }

    // 回复必须指向同文章下已通过的评论
    if (normalizedParentId) {
      const parent = await readComment(normalizedParentId)
      if (!parent || parent.postSlug !== normalizedPostSlug || parent.status !== 'approved') {
        return NextResponse.json({ error: '回复的评论不存在或未通过审核' }, { status: 400 })
      }
    }

    const ip = getClientIp(request)
    const rl = hitRateLimit(`comment:${ip}`, COMMENT_RATE_LIMIT, COMMENT_RATE_WINDOW_MS)
    if (!rl.ok) {
      log.warn('评论触发限流', { ip })
      return NextResponse.json(
        { error: `提交太频繁，请 ${rl.retryAfterSec} 秒后再试` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const comment = await createComment({
      postSlug: normalizedPostSlug,
      ...(normalizedParentId ? { parentId: normalizedParentId } : {}),
      name: normalizedName || '匿名',
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      content: normalizedContent,
    })

    // 通知失败不阻塞评论创建
    try {
      const type = normalizedParentId ? 'reply' : 'comment'
      const title = normalizedParentId ? '收到新回复' : '收到新评论'
      const contentPreview = normalizedContent.length > 50 ? normalizedContent.slice(0, 50) + '...' : normalizedContent
      await createNotification({
        type,
        title,
        content: `${normalizedName || '匿名'}: ${contentPreview}`,
        commentId: comment.id,
        postSlug: normalizedPostSlug,
      })
    } catch (notifErr) {
      log.warn('通知创建失败（不影响评论）', { error: String(notifErr) })
    }

    // 站外推送（Bark / Server酱 / 邮件）挪到响应之后执行。
    // 三个渠道各带 8-10s 超时，若在这里 await，提交评论的响应会被推送服务的网络状况
    // 拖着走（最坏 10 秒），用户侧表现为"点了没反应"。after() 在响应发出后才运行，
    // 既保持了"推送失败不影响评论"的语义，又不阻塞响应。
    after(async () => {
      try {
        const { pushCommentNotification } = await import('@/lib/push')
        await pushCommentNotification({
          type: normalizedParentId ? 'reply' : 'comment',
          postTitle: post.title,
          postSlug: normalizedPostSlug,
          commenter: normalizedName || '匿名',
          content: normalizedContent,
        })
      } catch (pushErr) {
        log.warn('评论推送失败（不影响评论）', { error: String(pushErr) })
      }
    })

    log.info('评论创建成功', { id: comment.id, postSlug: normalizedPostSlug })
    return NextResponse.json(toPublicComment(comment), { status: 201 })
  } catch (err) {
    log.error('评论创建失败', { error: String(err) })
    return NextResponse.json({ error: '评论创建失败' }, { status: 500 })
  }
}
