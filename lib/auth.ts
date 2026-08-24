// 服务端鉴权工具：
// - 从环境变量读取管理员密码（未设置时使用开发期默认值并打 warn）
// - 登录成功签发随机 token，写入服务端 token 集合并以 HttpOnly Cookie 下发
// - 后续请求通过 Cookie 自动鉴权；登出/过期清除
// 仅用于服务端（lib/posts-store / route handlers），禁止在客户端组件直接 import。

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createLogger } from '@/lib/logger'

const log = createLogger('auth')

const COOKIE_NAME = 'start_admin_token'
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

// 内存中的 token 表：{ token: expireAtMs }
// 注意：dev 模式下 Turbopack 会为 RSC（如文章详情页）与 route handler（/api/auth/*）
// 创建不同的 lib/auth 模块实例，若直接 new Map() 各实例各持一张表，
// 会导致登录签发的 token 在文章页鉴权时查不到（草稿 404）。
// 借助 globalThis（进程级，跨模块实例共享）让两处用同一张表。
// 生产多实例部署场景仍应改到 Redis/DB。
const globalForTokens = globalThis as unknown as {
  __startTokenStore?: Map<string, number>
}
const tokenStore =
  globalForTokens.__startTokenStore ?? new Map<string, number>()
if (!globalForTokens.__startTokenStore) {
  globalForTokens.__startTokenStore = tokenStore
}

function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD
  if (pw) return pw
  const fallback = '123456'
  log.warn('未设置 ADMIN_PASSWORD 环境变量，使用开发期默认密码。请在 .env.local 中配置 ADMIN_PASSWORD=你的密码', { fallback })
  return fallback
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

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function issueSession(): { token: string; expireAt: Date } {
  const token = generateToken()
  const expireAt = new Date(Date.now() + TOKEN_TTL_MS)
  tokenStore.set(token, expireAt.getTime())
  log.info('签发新会话', { expireAt: expireAt.toISOString(), active: tokenStore.size })
  return { token, expireAt }
}

export function revokeSession(token: string): void {
  const existed = tokenStore.delete(token)
  log.info('撤销会话', { existed, remaining: tokenStore.size })
}

export function validateSession(token: string | null | undefined): boolean {
  if (!token) return false
  const expireAt = tokenStore.get(token)
  if (!expireAt) return false
  if (Date.now() > expireAt) {
    tokenStore.delete(token)
    log.debug('会话过期已清理', { remaining: tokenStore.size })
    return false
  }
  return true
}

export const auth = {
  cookieName: COOKIE_NAME,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
}
