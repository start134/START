// 服务端鉴权工具：
// - 从环境变量读取管理员密码（生产未设置时由登录接口直接拒绝；开发期回退默认值并 warn）
// - 登录成功签发 HMAC 签名的无状态会话 token（`${exp}.${签名}`），以 HttpOnly Cookie 下发。
//   不依赖服务端存储，多实例/冷启动部署会话不丢；修改密码（或 SESSION_SECRET）即全员下线。
// - 后续请求通过 Cookie 自动鉴权；登出仅清除 Cookie，已签发 token 在过期前仍有效，
//   该泄露窗口与 7 天 TTL 对齐，单管理员博客可接受。
// 仅用于服务端（lib/posts-store / route handlers），禁止在客户端组件直接 import。

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { createLogger } from '@/lib/logger'

const log = createLogger('auth')

const COOKIE_NAME = 'start_admin_token'
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

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
  return `start-blog:v1:${process.env.ADMIN_PASSWORD ?? 'dev-insecure'}`
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

// token 格式 `${过期毫秒}.${HMAC 签名}`，签名恒为 64 位 hex
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
  if (!signatureEquals(sig, sign(payload))) return false
  const expireAt = Number(payload)
  if (!Number.isFinite(expireAt) || Date.now() > expireAt) return false
  return true
}

// 供 route handler / RSC 统一判断当前请求是否已登录
export async function isAuthenticatedRequest(): Promise<boolean> {
  const cookieStore = await cookies()
  return validateSession(cookieStore.get(COOKIE_NAME)?.value)
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
