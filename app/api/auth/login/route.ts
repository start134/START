import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import {
  auth,
  isAdminPasswordConfigured,
  issueSession,
  verifyAdminPassword,
} from '@/lib/auth'
import {
  checkFailureLimit,
  clearFailures,
  getClientIp,
  recordFailure,
} from '@/lib/rate-limit'

const log = createLogger('api/auth/login')

// 登录防爆破：单 IP 连续失败 5 次锁定 15 分钟（成功登录清零，不影响正常使用）
const LOGIN_MAX_FAILURES = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export async function POST(request: NextRequest) {
  log.debug('收到登录请求')
  // 生产环境未配置密码时直接拒绝，绝不回退默认密码
  if (process.env.NODE_ENV === 'production' && !isAdminPasswordConfigured()) {
    log.error('生产环境未配置 ADMIN_PASSWORD，拒绝登录')
    return NextResponse.json(
      { error: '服务端未配置 ADMIN_PASSWORD，登录不可用' },
      { status: 503 }
    )
  }

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

  const ip = getClientIp(request)
  const limitKey = `login:${ip}`
  const limit = checkFailureLimit(limitKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS)
  if (!limit.ok) {
    log.warn('登录触发限流', { ip })
    return NextResponse.json(
      { error: `失败次数过多，请 ${limit.retryAfterSec} 秒后再试` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    )
  }

  if (!verifyAdminPassword(password)) {
    recordFailure(limitKey, LOGIN_WINDOW_MS)
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }
  clearFailures(limitKey)

  const { token, expireAt } = issueSession()
  const cookieStore = await cookies()
  cookieStore.set(auth.cookieName, token, {
    ...auth.cookieOptions,
    expires: expireAt,
  })
  log.info('登录成功，已下发会话 Cookie')
  return NextResponse.json({ ok: true })
}
