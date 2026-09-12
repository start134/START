// 会话令牌的纯实现（不依赖 next/headers，可被 route handler / RSC / proxy 共用）：
// - token 格式 `${过期毫秒}.${HMAC-SHA256 签名}`，无状态，多实例/重启登录态不丢
// - 修改 ADMIN_PASSWORD（或 SESSION_SECRET）即全员下线
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createLogger } from '@/lib/logger'

const log = createLogger('session')

export const COOKIE_NAME = 'start_admin_token'
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

export function isAdminPasswordConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD
}

function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD
  if (pw) return pw
  const fallback = '123456'
  log.warn('未设置 ADMIN_PASSWORD 环境变量，使用开发期默认密码。请在 .env.local 中配置 ADMIN_PASSWORD=你的密码', { fallback })
  return fallback
}

// 会话签名密钥：优先 SESSION_SECRET，否则从管理员密码派生（改密码 = 所有旧会话失效）
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminPassword) return `start-blog:v1:${adminPassword}`
  // 生产环境绝不允许回退到可预测的常量。
  // 旧实现回退成 'start-blog:v1:dev-insecure'：这个字符串是公开的，任何人都能自己
  // 算出 HMAC 伪造一个过期时间合法的 Cookie，直接绕过登录拿到管理权限。
  // 抛错后由 validateSession 捕获，表现为"所有会话一律无效"——失败关闭。
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 ADMIN_PASSWORD 或 SESSION_SECRET 才能签发/校验会话')
  }
  return 'start-blog:v1:dev-insecure'
}

// 用 timingSafeEqual 做恒定时间比较，避免时序攻击
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8')
  const bBuf = Buffer.from(b, 'utf-8')
  const len = Math.max(aBuf.length, bBuf.length)
  const padA = Buffer.alloc(len, 0)
  const padB = Buffer.alloc(len, 0)
  aBuf.copy(padA)
  bBuf.copy(padB)
  try {
    return timingSafeEqual(padA, padB) && aBuf.length === bBuf.length
  } catch {
    return false
  }
}

export function verifyAdminPassword(input: string): boolean {
  const ok = safeEqual(input, getAdminPassword())
  if (!ok) log.warn('密码校验失败')
  return ok
}

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
}

// 签名恒为 64 位 hex，长度不等直接否（长度本身不泄露信息）
function signatureEquals(sig: string, expected: string): boolean {
  if (sig.length !== expected.length) return false
  return safeEqual(sig, expected)
}

export function issueSession(): { token: string; expireAt: Date } {
  const expireAt = Date.now() + TOKEN_TTL_MS
  const payload = String(expireAt)
  const token = `${payload}.${sign(payload)}`
  log.info('签发新会话', { expireAt: new Date(expireAt).toISOString() })
  return { token, expireAt: new Date(expireAt) }
}

export function validateSession(token: string | null | undefined): boolean {
  if (!token) return false
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: string
  try {
    expected = sign(payload)
  } catch (err) {
    // 密钥不可用（例如生产环境漏配 ADMIN_PASSWORD 与 SESSION_SECRET）：
    // 此时无法安全地校验签名，一律视为未登录，绝不"放行"。
    log.error('会话密钥不可用，拒绝校验', { error: String(err) })
    return false
  }
  if (!signatureEquals(sig, expected)) return false
  const expireAt = Number(payload)
  if (!Number.isFinite(expireAt) || Date.now() > expireAt) return false
  return true
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}
