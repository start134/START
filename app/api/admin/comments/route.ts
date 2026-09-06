import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createLogger } from '@/lib/logger'
import { auth, validateSession } from '@/lib/auth'
import { getAllCommentsForAdmin, approveComment, deleteComment } from '@/lib/comments-store'

const log = createLogger('api/admin/comments')

async function requireAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(auth.cookieName)?.value
  if (!validateSession(token)) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  return null
}

export async function GET() {
  const authErr = await requireAuth()
  if (authErr) return authErr

  try {
    const comments = await getAllCommentsForAdmin()
    log.debug('获取所有评论成功', { count: comments.length })
    return NextResponse.json(comments)
  } catch (err) {
    log.error('获取评论失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const authErr = await requireAuth()
  if (authErr) return authErr

  const body = await request.json().catch(() => ({}))
  const { id, action } = body

  if (!id || !action) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 })
  }

  if (action === 'approve') {
    try {
      const comment = await approveComment(id)
      if (!comment) {
        return NextResponse.json({ error: '评论不存在' }, { status: 404 })
      }
      log.info('评论已批准', { id })
      return NextResponse.json(comment)
    } catch (err) {
      log.error('批准评论失败', { id, error: String(err) })
      return NextResponse.json({ error: '操作失败' }, { status: 500 })
    }
  }

  if (action === 'delete') {
    try {
      const deleted = await deleteComment(id)
      if (!deleted) {
        return NextResponse.json({ error: '评论不存在' }, { status: 404 })
      }
      log.info('评论已删除', { id })
      return NextResponse.json({ success: true })
    } catch (err) {
      log.error('删除评论失败', { id, error: String(err) })
      return NextResponse.json({ error: '操作失败' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
