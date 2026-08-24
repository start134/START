import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createLogger } from '@/lib/logger'
import { auth, validateSession } from '@/lib/auth'
import { readAllNotifications, markAllAsRead, getUnreadCount } from '@/lib/notifications-store'

const log = createLogger('api/notifications')

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
    const notifications = await readAllNotifications()
    const unreadCount = await getUnreadCount()
    log.info('获取通知成功', { count: notifications.length, unreadCount })
    return NextResponse.json({ notifications, unreadCount })
  } catch (err) {
    log.error('获取通知失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function PATCH() {
  const authErr = await requireAuth()
  if (authErr) return authErr

  try {
    await markAllAsRead()
    log.info('所有通知已标记为已读')
    return NextResponse.json({ success: true })
  } catch (err) {
    log.error('标记通知失败', { error: String(err) })
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}
