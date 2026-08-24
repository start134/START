import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import {
  auth,
  issueSession,
  revokeSession,
  validateSession,
  verifyAdminPassword,
} from '@/lib/auth'

const log = createLogger('api/auth/login')

export async function POST(request: NextRequest) {
  log.info('收到登录请求')
  let body: { password?: string }
  try {
    body = (await request.json()) as { password?: string }
  } catch (err) {
    log.warn('登录请求体解析失败', { error: String(err) })
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (!password) {
    log.warn('登录失败：密码为空')
    return NextResponse.json({ error: '请输入密码' }, { status: 400 })
  }

  if (!verifyAdminPassword(password)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }

  const { token, expireAt } = issueSession()
  const cookieStore = await cookies()
  cookieStore.set(auth.cookieName, token, {
    ...auth.cookieOptions,
    expires: expireAt,
  })
  log.info('登录成功，已下发会话 Cookie')
  return NextResponse.json({ ok: true })
}
