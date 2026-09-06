import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createLogger } from '@/lib/logger'
import { auth, validateSession } from '@/lib/auth'
import { deleteComment, approveComment, readComment } from '@/lib/comments-store'

const log = createLogger('api/comments/[id]')

async function requireAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(auth.cookieName)?.value
  if (!validateSession(token)) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAuth()
  if (authErr) return authErr

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  if (body.action === 'approve') {
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

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAuth()
  if (authErr) return authErr

  const { id } = await params
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
