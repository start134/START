import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createLogger } from '@/lib/logger'
import { auth, validateSession } from '@/lib/auth'
import { markAsRead, deleteNotification } from '@/lib/notifications-store'

const log = createLogger('api/notifications/[id]')

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
  try {
    const notification = await markAsRead(id)
    if (!notification) {
      return NextResponse.json({ error: '通知不存在' }, { status: 404 })
    }
    log.info('通知已标记为已读', { id })
    return NextResponse.json(notification)
  } catch (err) {
    log.error('标记通知失败', { id, error: String(err) })
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAuth()
  if (authErr) return authErr

  const { id } = await params
  try {
    const deleted = await deleteNotification(id)
    if (!deleted) {
      return NextResponse.json({ error: '通知不存在' }, { status: 404 })
    }
    log.info('通知已删除', { id })
    return NextResponse.json({ success: true })
  } catch (err) {
    log.error('删除通知失败', { id, error: String(err) })
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}
