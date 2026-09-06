import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import {
  createComment,
  readComment,
  readCommentsByPost,
  toPublicComment,
  type CommentInput,
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

  let body: CommentInput
  try {
    body = (await request.json()) as CommentInput
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const { postSlug, name, content, parentId, email } = body ?? ({} as CommentInput)
  if (!postSlug || typeof postSlug !== 'string' || !content?.trim()) {
    return NextResponse.json({ error: '文章ID和评论内容不能为空' }, { status: 400 })
  }
  if (content.trim().length > MAX_CONTENT_LEN) {
    return NextResponse.json(
      { error: `评论内容过长（最多 ${MAX_CONTENT_LEN} 字）` },
      { status: 400 }
    )
  }
  if (name && name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: '昵称过长' }, { status: 400 })
  }
  if (email && (email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email))) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
  }

  try {
    // 只允许对已发布的文章评论
    const post = await readPost(postSlug)
    if (!post || !isPublishedPost(post)) {
      return NextResponse.json({ error: '文章不存在或未发布' }, { status: 404 })
    }

    // 回复必须指向同文章下已通过的评论
    if (parentId) {
      if (typeof parentId !== 'string') {
        return NextResponse.json({ error: 'parentId 不合法' }, { status: 400 })
      }
      const parent = await readComment(parentId)
      if (!parent || parent.postSlug !== postSlug || parent.status !== 'approved') {
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
      postSlug,
      parentId,
      name,
      email,
      content,
    })

    // 通知失败不阻塞评论创建
    try {
      const type = parentId ? 'reply' : 'comment'
      const title = parentId ? '收到新回复' : '收到新评论'
      const contentPreview = content.length > 50 ? content.slice(0, 50) + '...' : content
      await createNotification({
        type,
        title,
        content: `${name || '匿名'}: ${contentPreview}`,
        commentId: comment.id,
        postSlug,
      })
    } catch (notifErr) {
      log.warn('通知创建失败（不影响评论）', { error: String(notifErr) })
    }

    log.info('评论创建成功', { id: comment.id, postSlug })
    return NextResponse.json(toPublicComment(comment), { status: 201 })
  } catch (err) {
    log.error('评论创建失败', { error: String(err) })
    return NextResponse.json({ error: '评论创建失败' }, { status: 500 })
  }
}
