import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { createComment, readCommentsByPost, type CommentInput } from '@/lib/comments-store'
import { createNotification } from '@/lib/notifications-store'

const log = createLogger('api/comments')

export async function GET(request: NextRequest) {
  const postSlug = request.nextUrl.searchParams.get('postSlug')
  if (!postSlug) {
    return NextResponse.json({ error: '缺少 postSlug 参数' }, { status: 400 })
  }

  try {
    const comments = await readCommentsByPost(postSlug)
    log.info('获取评论成功', { postSlug, count: comments.length })
    return NextResponse.json(comments)
  } catch (err) {
    log.error('获取评论失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  log.info('收到请求：POST /api/comments')

  let body: CommentInput
  try {
    body = (await request.json()) as CommentInput
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const { postSlug, name, content, parentId } = body
  if (!postSlug || !content?.trim()) {
    return NextResponse.json({ error: '文章ID和评论内容不能为空' }, { status: 400 })
  }

  try {
    const comment = await createComment({
      postSlug,
      parentId,
      name,
      email: body.email,
      content,
    })

    // 创建通知
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

    log.info('评论创建成功', { id: comment.id, postSlug })
    return NextResponse.json(comment, { status: 201 })
  } catch (err) {
    log.error('评论创建失败', { error: String(err) })
    return NextResponse.json({ error: '评论创建失败' }, { status: 500 })
  }
}
